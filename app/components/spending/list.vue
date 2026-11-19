<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatCents } from "../../../shared/utils/money-cents";

type Expense = Doc<"expenses">;

const { expenses, removeExpense } = useExpenses();

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Expense>();
const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Name",
    cell: (context) => context.getValue(),
  }),
  columnHelper.accessor("notes", {
    header: "Notes",
    cell: (context) => context.getValue(),
  }),
  columnHelper.display({
    id: "amount",
    header: "Value",
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
  }),
]);

const expenseData = computed(() => expenses.value ?? []);
const table = useTable({
  features,
  columns,
  data: expenseData,
  getRowId: (row) => row._id,
});

function onDelete(id: Expense["_id"]) {
  removeExpense(id);
}

const { closePopoverById } = usePopoverClose();

function onExpenseUpdated(id: string) {
  closePopoverById(id);
}

function budgetImpactCents(expense: Expense): bigint {
  return (expense.amountCents ?? 0n) - (expense.fromSavingsCents ?? 0n);
}
</script>

<template>
  <div class="u-scroll">
    <table>
      <thead>
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th v-for="header in headerGroup.headers" :key="header.id">
            <FlexRender v-if="!header.isPlaceholder" :header="header" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in table.getRowModel().rows" :key="row.id">
          <td v-for="cell in row.getAllCells()" :key="cell.id">
            <template v-if="cell.column.id === 'name'">
              <div>
                <span>{{ row.original.name }}</span>
                <span v-if="row.original.goalId !== undefined"> Want purchase </span>
              </div>
            </template>
            <template v-else-if="cell.column.id === 'amount'">
              <span>
                {{ formatCents(row.original.amountCents) }}
              </span>
              <p v-if="(row.original.fromSavingsCents ?? 0n) > 0n">
                {{ formatCents(row.original.amountCents) }} total ·
                {{ formatCents(row.original.fromSavingsCents ?? 0n) }} from savings ·
                {{ formatCents(budgetImpactCents(row.original)) }} budget impact
              </p>
            </template>
            <template v-else-if="cell.column.id === 'actions'">
              <template v-if="row.original.goalId === undefined">
                <button @click="onDelete(row.original._id)">Delete</button>
                <button :popovertarget="row.id">Edit</button>
                <div :id="row.id" popover>
                  <LazyExpensesEdit
                    :expense="row.original"
                    submit-label="Update Spending"
                    @updated="onExpenseUpdated"
                  />
                </div>
              </template>
            </template>
            <FlexRender v-else :cell="cell" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
