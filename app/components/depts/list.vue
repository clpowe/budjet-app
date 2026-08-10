<script setup lang="ts">
import type { Id } from "../../../convex/_generated/dataModel";
import { VueDraggable } from "vue-draggable-plus";

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
const { depts, update, remove, reorder } = useDepts();

const drawerToggles = ref<HTMLInputElement[]>([]);
const localDepts = ref<any[]>([]);

watch(
  depts,
  (newVal) => {
    if (newVal) localDepts.value = [...newVal];
  },
  { immediate: true },
);

async function onSort() {
  const updates = localDepts.value.map((item, index) => ({
    id: item._id as Id<"debts">,
    order: index,
  }));
  await reorder({ updates });
}

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
        <th></th>
        <th>In Snowball</th>
        <th class="w-full">Creditor</th>
        <th>Payment</th>
        <th>Actions</th>
      </tr>
    </thead>
    <VueDraggable v-model="localDepts" tag="tbody" handle=".drag-handle" @end="onSort">
      <tr v-for="item in localDepts" :key="item._id">
        <td class="w-8">
          <button class="drag-handle cursor-move btn btn-ghost btn-sm">
            <Icon name="lucide:grip-vertical" size="20" />
          </button>
        </td>
        <td>
          <button @click="onPriorityToggle(item._id, !item.isPriority)">
            <Icon
              v-if="item.isPriority"
              name="lucide:circle-check"
              size="24"
              class="text-green-500"
            />
            <Icon v-else name="lucide:circle-x" size="24" class="text-red-500" />
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
                <Icon name="i-material-symbols:edit-square-outline-rounded" size="24" />
              </label>
            </div>
            <div class="drawer-side">
              <label :for="item._id" aria-label="close sidebar" class="drawer-overlay"></label>
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
    </VueDraggable>
  </table>
</template>
