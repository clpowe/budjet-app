<script setup lang="ts">
const { expenses, remove } = useExpenses();
import type { Doc } from "../../../convex/_generated/dataModel";

function onDelete(id: Doc<"expenses">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onExpenseUpdated(id: string) {
  closePopoverById(id);
}
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th class="w-full">Name</th>
        <th>Value</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in expenses" :key="item._id">
        <td>{{ item.name }}</td>
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
                <Icon name="i-material-symbols:edit-square-outline-rounded" />
              </label>
            </div>
            <div class="drawer-side">
              <label
                :for="item._id"
                aria-label="close sidebar"
                class="drawer-overlay"
              ></label>
              <div class="menu bg-base-200 min-h-full w-80 p-4">
                <lazy-expenses-edit
                  :expense="item"
                  @updated="onExpenseUpdated"
                />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
