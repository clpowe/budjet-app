<script setup lang="ts">
import type { Id } from "../../../convex/_generated/dataModel";

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
const { depts, update, remove } = useDepts();

const drawerToggles = ref<HTMLInputElement[]>([]);

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
async function onPriorityToggle(id: Id<"debts">, value: boolean) {
  if (!id) return;
  await update({ id, isPriority: value });
}

function closeDrawer(id: Id<"debts">) {
  const toggle = drawerToggles.value.find((el) => el?.id === id);
  if (toggle) toggle.checked = false;
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onEditSaved(id: Id<"debts">) {
  if (!id) return;
  closeDrawer(id);
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onDelete(id: Id<"debts">) {
  remove({ id });
}
</script>

<template>
  <table class="table">
    <thead>
      <tr>
        <th>In Snowball</th>
        <th class="w-full">Creditor</th>
        <th>Payment</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in depts" :key="item._id">
        <td>
          <button @click="onPriorityToggle(item._id, !item.isPriority)">
            <Icon
              v-if="item.isPriority"
              name="lucide:circle-check"
              size="24"
              class="text-green-500"
            />
            <Icon
              v-else
              name="lucide:circle-x"
              size="24"
              class="text-red-500"
            />
          </button>
        </td>
        <td>{{ item.creditor }}</td>

        <td>{{ formatMoney(item.payment) }}</td>
        <td class="flex gap-12">
          <div class="drawer drawer-end w-full">
            <input
              ref="drawerToggles"
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
                <lazy-depts-edit :depts="item" @updated="onEditSaved" />
              </div>
            </div>
          </div>
          <button @click="onDelete(item._id)" class="btn btn-circle">
            <Icon
              name="i-material-symbols:delete-forever-outline-rounded"
              size="24"
              class="text-red-500/30"
            />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
