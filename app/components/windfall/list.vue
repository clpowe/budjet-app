<script setup lang="ts">
import { createColumnHelper, FlexRender, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";

const { windfall, remove } = useWindfall();

function onDelete(id: Doc<"windfall">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onWindfallUpdated(id: string) {
  closePopoverById(id);
}

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Doc<"windfall">>();
const columns = columnHelper.columns([
  columnHelper.accessor("source", {
    header: "Name",
  }),
  columnHelper.accessor("amount", {
    header: "Value",
    cell: ({ getValue }) => formatMoney(getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
  }),
]);

const income = computed(() => {
  return windfall.value?.filter(({ amount }) => amount > 0) ?? [];
});

const expense = computed(() => {
  return windfall.value?.filter(({ amount }) => amount <= 0) ?? [];
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
  <div class="flex flex-wrap gap-8 w-full">
    <div v-for="section in tableSections" :key="section.key" class="space-y-2 flex-1 min-w-[280px]">
      <div class="text-sm uppercase tracking-wide text-gray-500">
        {{ section.label }}
      </div>
      <table class="table w-full">
        <thead>
          <tr v-for="headerGroup in section.table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="{ 'w-full': header.column.id === 'source' }"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in section.table.getRowModel().rows" :key="row.id">
            <td
              v-for="cell in row.getAllCells()"
              :key="cell.id"
              :class="{ 'flex gap-2': cell.column.id === 'actions' }"
            >
              <template v-if="cell.column.id === 'actions'">
                <button @click="onDelete(row.original._id)" class="btn btn-circle">
                  <Icon
                    name="i-material-symbols:delete-forever-outline-rounded"
                    size="24"
                    class="text-red-500/30"
                  />
                </button>
                <div class="drawer drawer-end w-full">
                  <input :id="row.original._id" type="checkbox" class="drawer-toggle w-full" />
                  <div class="drawer-content">
                    <label :for="row.original._id" class="drawer-button btn btn-circle">
                      <Icon name="i-material-symbols:edit-square-outline-rounded" size="24" />
                    </label>
                  </div>
                  <div class="drawer-side">
                    <label
                      :for="row.original._id"
                      aria-label="close sidebar"
                      class="drawer-overlay"
                    ></label>
                    <div class="menu bg-base-200 min-h-full w-80 p-4">
                      <lazy-windfall-edit :windfall="row.original" @updated="onWindfallUpdated" />
                    </div>
                  </div>
                </div>
              </template>
              <FlexRender v-else :cell="cell" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
