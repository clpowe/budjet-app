<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatMoney } from "../../../shared/utils/format-money";
import { formatCents } from "../../../shared/utils/money-cents";

type Expense = Doc<"expenses">;

const { expenses, remove } = useExpenses();

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
  columnHelper.accessor("amount", {
    header: "Value",
    cell: (context) => formatMoney(context.getValue()),
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
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onExpenseUpdated(id: string) {
  closePopoverById(id);
}

function budgetImpactCents(expense: Expense): bigint {
  return (expense.amountCents ?? 0n) - (expense.reserveUsedCents ?? 0n);
}
</script>

<template>
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
            <div class="flex flex-wrap items-center gap-2">
              <span>{{ row.original.name }}</span>
              <span
                v-if="row.original.wantItemId !== undefined"
                class="badge badge-primary badge-outline badge-sm"
              >
                Want purchase
              </span>
            </div>
          </template>
          <template v-else-if="cell.column.id === 'amount'">
            <span>
              {{
                row.original.amountCents === undefined
                  ? formatMoney(row.original.amount)
                  : formatCents(row.original.amountCents)
              }}
            </span>
            <p
              v-if="(row.original.reserveUsedCents ?? 0n) > 0n"
              class="mt-1 text-xs text-base-content/60"
            >
              {{ formatCents(row.original.amountCents ?? 0n) }} total ·
              {{ formatCents(row.original.reserveUsedCents ?? 0n) }} from reserve ·
              {{ formatCents(budgetImpactCents(row.original)) }} budget impact
            </p>
          </template>
          <template v-else-if="cell.column.id === 'actions'">
            <template v-if="row.original.wantItemId === undefined">
              <button @click="onDelete(row.original._id)">Delete</button>
              <button :popovertarget="row.id">Edit</button>
              <div :id="row.id" popover>
                <LazySpendingEdit :expense="row.original" @updated="onExpenseUpdated" />
              </div>
            </template>
          </template>
          <FlexRender v-else :cell="cell" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
