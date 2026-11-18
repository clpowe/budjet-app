<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatMoney } from "../../../shared/utils/format-money";
import { formatCents, legacyDollarsToCents } from "../../../shared/utils/money-cents";

type Expense = Doc<"expenses">;

const props = defineProps<{
  expenses: Expense[];
  remove: (id: Expense["_id"]) => unknown;
}>();

const editDialogs = ref<HTMLDialogElement[]>([]);

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Expense>();
const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Name",
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

const expenseData = computed(() => props.expenses);
const table = useTable({
  features,
  columns,
  data: expenseData,
  getRowId: (row) => row._id,
});

function formatPurchaseFunding(expense: Expense) {
  const total = expense.amountCents ?? legacyDollarsToCents(expense.amount);
  const savings = expense.savingsUsedCents ?? 0n;
  return `${formatCents(total)} total · ${formatCents(savings)} from savings · ${formatCents(total - savings)} budget impact`;
}

function onDelete(item: Expense) {
  const confirmed = window.confirm(`Delete "${item.name}"? This can't be undone.`);

  if (!confirmed) return;

  props.remove(item._id);
}

function openEditDialog(id: string) {
  editDialogs.value.find((element) => element?.id === id)?.showModal();
}

function closeEditDialog(id: string) {
  editDialogs.value.find((element) => element?.id === id)?.close();
}

function onExpenseUpdated(id: string) {
  closeEditDialog(id);
}
</script>

<template>
  <section aria-labelledby="today-expenses-heading">
    <h2 id="today-expenses-heading" class="u-visually-hidden">Today&apos;s expenses</h2>
    <div class="u-scroll">
      <table>
        <caption class="u-visually-hidden">
          Today&apos;s expenses with amount and edit or delete actions.
        </caption>
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
              <template v-if="cell.column.id === 'amount' && row.original.wantItemId">
                {{ formatPurchaseFunding(row.original) }}
              </template>
              <template v-else-if="cell.column.id === 'actions' && row.original.wantItemId">
                Want purchase
              </template>
              <template v-else-if="cell.column.id === 'actions'">
                <div class="actions">
                  <button
                    type="button"
                    :aria-label="`Edit ${row.original.name}`"
                    @click="openEditDialog(row.id)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    :aria-label="`Delete ${row.original.name}`"
                    @click="onDelete(row.original)"
                  >
                    Delete
                  </button>
                </div>
                <dialog :id="row.id" ref="editDialogs">
                  <header class="l-cluster l-split">
                    <h2>Edit {{ row.original.name }}</h2>
                    <form method="dialog"><button type="submit">Close</button></form>
                  </header>
                  <lazy-expenses-edit :expense="row.original" @updated="onExpenseUpdated" />
                </dialog>
              </template>
              <FlexRender v-else :cell="cell" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
