<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatMoney } from "../../../shared/utils/format-money";

type Expense = Doc<"expenses">;

const props = defineProps<{
  expenses: Expense[];
  remove: (id: Expense["_id"]) => unknown;
}>();

const drawerToggles = ref<HTMLInputElement[]>([]);

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

function onDelete(item: Expense) {
  const confirmed = window.confirm(`Delete "${item.name}"? This can't be undone.`);

  if (!confirmed) return;

  props.remove(item._id);
}

function openEditDrawer(id: string) {
  const toggle = drawerToggles.value.find((el) => el?.id === id);
  if (toggle) toggle.checked = true;
}

function closeEditDrawer(id: string) {
  const toggle = drawerToggles.value.find((el) => el?.id === id);
  if (toggle) toggle.checked = false;
}

function onExpenseUpdated(id: string) {
  closeEditDrawer(id);
}
</script>

<template>
  <section aria-labelledby="today-expenses-heading">
    <h2 id="today-expenses-heading" class="sr-only">Today&apos;s expenses</h2>
    <div class="overflow-x-auto">
      <table class="table w-full min-w-xl">
        <caption class="sr-only">
          Today&apos;s expenses with amount and edit or delete actions.
        </caption>
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="header.column.id === 'name' ? 'w-full' : undefined"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.getRowModel().rows" :key="row.id">
            <td
              v-for="cell in row.getAllCells()"
              :key="cell.id"
              :class="cell.column.id === 'actions' ? 'flex min-w-28 gap-2' : undefined"
            >
              <template v-if="cell.column.id === 'actions'">
                <button
                  @click="onDelete(row.original)"
                  class="btn btn-circle"
                  :aria-label="`Delete ${row.original.name}`"
                  :title="`Delete ${row.original.name}`"
                >
                  <Icon
                    name="i-material-symbols:delete-forever-outline-rounded"
                    size="24"
                    class="text-error/30"
                  />
                </button>
                <div class="drawer drawer-end w-full">
                  <input
                    ref="drawerToggles"
                    :id="row.id"
                    type="checkbox"
                    class="drawer-toggle w-full"
                  />
                  <div class="drawer-content">
                    <button
                      type="button"
                      class="drawer-button btn btn-circle"
                      @click="openEditDrawer(row.id)"
                      :aria-label="`Edit ${row.original.name}`"
                      :title="`Edit ${row.original.name}`"
                    >
                      <Icon name="i-material-symbols:edit-square-outline-rounded" />
                    </button>
                  </div>
                  <div class="drawer-side">
                    <label :for="row.id" aria-label="close sidebar" class="drawer-overlay"></label>
                    <div class="menu bg-base-200 min-h-full w-80 p-4">
                      <lazy-expenses-edit :expense="row.original" @updated="onExpenseUpdated" />
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
  </section>
</template>
