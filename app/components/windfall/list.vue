<script setup lang="ts">
const { windfall, remove } = useWindfall();
import type { Doc } from "../../../convex/_generated/dataModel";

function onDelete(id: Doc<"windfall">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onWindfallUpdated(id: string) {
  closePopoverById(id);
}

const windfallSplit = computed(() => {
  if (!windfall.value) {
    return { income: [], expense: [] };
  }
  return Object.groupBy(windfall.value, ({ amount }) =>
    amount > 0 ? "income" : "expense",
  );
});
</script>

<template>
  <div class="flex flex-wrap gap-8 w-full">
    <div
      v-for="(items, key) in windfallSplit"
      :key="key"
      class="space-y-2 flex-1 min-w-[280px]"
    >
      <div class="text-sm uppercase tracking-wide text-gray-500">
        {{ key === "income" ? "Income" : "Outflows" }}
      </div>
      <table class="table w-full">
        <thead>
          <tr>
            <th class="w-full">Name</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item._id">
            <td>{{ item.source }}</td>
            <td>{{ formatMoney(item.amount) }}</td>
            <td class="flex gap-2">
              <button @click="onDelete(item._id)" class="btn btn-circle">
                <Icon
                  name="i-material-symbols:delete-forever-outline-rounded"
                  size="24"
                  class="text-red-500/30"
                />
              </button>
              <div class="drawer drawer-end w-full">
                <input
                  :id="item._id"
                  type="checkbox"
                  class="drawer-toggle w-full"
                />
                <div class="drawer-content">
                  <label :for="item._id" class="drawer-button btn btn-circle">
                    <Icon
                      name="i-material-symbols:edit-square-outline-rounded"
                      size="24"
                    />
                  </label>
                </div>
                <div class="drawer-side">
                  <label
                    :for="item._id"
                    aria-label="close sidebar"
                    class="drawer-overlay"
                  ></label>
                  <div class="menu bg-base-200 min-h-full w-80 p-4">
                    <lazy-windfall-edit
                      :windfall="item"
                      @updated="onWindfallUpdated"
                    />
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
