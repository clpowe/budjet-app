<script setup lang="ts">
import { createColumnHelper, FlexRender, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatCents } from "../../../shared/utils/money-cents";

const { windfall, remove } = useWindfall();
const editDialogs = ref<HTMLDialogElement[]>([]);

function onDelete(id: Doc<"income">["_id"]) {
  remove(id);
}

function onWindfallUpdated(id: string) {
  editDialogs.value.find((element) => element?.id === id)?.close();
}

function openWindfallDialog(id: string) {
  editDialogs.value.find((element) => element?.id === id)?.showModal();
}

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Doc<"income">>();
const columns = columnHelper.columns([
  columnHelper.accessor("source", {
    header: "Name",
  }),
  columnHelper.accessor("amountCents", {
    id: "amount",
    header: "Value",
    cell: ({ getValue }) => formatCents(getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
  }),
]);

const income = computed(() => {
  return windfall.value?.filter(({ amountCents }) => amountCents > 0n) ?? [];
});

const expense = computed(() => {
  return windfall.value?.filter(({ amountCents }) => amountCents <= 0n) ?? [];
});

const incomeTable = useTable({
  features,
  columns,
  data: income,
  getRowId: (row) => row._id,
});

const expenseTable = useTable({
  features,
  columns,
  data: expense,
  getRowId: (row) => row._id,
});

const allTableSections = [
  { key: "income", label: "Income", table: incomeTable },
  { key: "expense", label: "Outflows", table: expenseTable },
] as const;

const tableSections = computed(() => {
  if (!windfall.value) return allTableSections;

  return allTableSections.filter((section) =>
    section.key === "income" ? income.value.length > 0 : expense.value.length > 0,
  );
});
</script>

<template>
  <div class="l-grid">
    <section v-for="section in tableSections" :key="section.key" class="l-stack">
      <h2>{{ section.label }}</h2>
      <table>
        <thead>
          <tr v-for="headerGroup in section.table.getHeaderGroups()" :key="headerGroup.id">
            <th v-for="header in headerGroup.headers" :key="header.id">
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in section.table.getRowModel().rows" :key="row.id">
            <td v-for="cell in row.getAllCells()" :key="cell.id">
              <template v-if="cell.column.id === 'actions'">
                <div class="actions">
                  <button
                    type="button"
                    :aria-label="`Edit ${row.original.source}`"
                    @click="openWindfallDialog(row.id)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    :aria-label="`Delete ${row.original.source}`"
                    @click="onDelete(row.original._id)"
                  >
                    Delete
                  </button>
                </div>
                <dialog :id="row.id" ref="editDialogs">
                  <header class="l-cluster l-split">
                    <h2>Edit {{ row.original.source }}</h2>
                    <form method="dialog"><button type="submit">Close</button></form>
                  </header>
                  <lazy-windfall-edit :windfall="row.original" @updated="onWindfallUpdated" />
                </dialog>
              </template>
              <FlexRender v-else :cell="cell" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
