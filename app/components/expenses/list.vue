<script setup lang="ts">
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  expenses: Doc<"expenses">[];
  remove: (id: Doc<"expenses">["_id"]) => unknown;
}>();

const drawerToggles = ref<HTMLInputElement[]>([]);

function onDelete(item: Doc<"expenses">) {
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
          <tr>
            <th class="w-full">Name</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in props.expenses" :key="item._id">
            <td>{{ item.name }}</td>
            <td>{{ formatMoney(item.amount) }}</td>
            <td class="flex min-w-28 gap-2">
              <button
                @click="onDelete(item)"
                class="btn btn-circle"
                :aria-label="`Delete ${item.name}`"
                :title="`Delete ${item.name}`"
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
                  :id="item._id"
                  type="checkbox"
                  class="drawer-toggle w-full"
                />
                <div class="drawer-content">
                  <button
                    type="button"
                    class="drawer-button btn btn-circle"
                    @click="openEditDrawer(item._id)"
                    :aria-label="`Edit ${item.name}`"
                    :title="`Edit ${item.name}`"
                  >
                    <Icon name="i-material-symbols:edit-square-outline-rounded" />
                  </button>
                </div>
                <div class="drawer-side">
                  <label :for="item._id" aria-label="close sidebar" class="drawer-overlay"></label>
                  <div class="menu bg-base-200 min-h-full w-80 p-4">
                    <lazy-expenses-edit :expense="item" @updated="onExpenseUpdated" />
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
