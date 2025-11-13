<script setup lang="ts">
import type { Doc } from "../../../convex/_generated/dataModel";
import SpendingEdit from "./edit.vue";

const props = defineProps<{
  spending: Doc<"spending">;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "close", value?: Doc<"spending">["_id"]): void;
}>();

const isOpen = ref(true);
const pendingCloseValue = ref<Doc<"spending">["_id"] | undefined>();

watch(
  () => isOpen.value,
  (open, previous) => {
    if (!open && previous) {
      emit("close", pendingCloseValue.value);
      pendingCloseValue.value = undefined;
    }
  }
);

function close(payload?: Doc<"spending">["_id"]) {
  pendingCloseValue.value = payload;
  isOpen.value = false;
}

function handleUpdated(spendingId: Doc<"spending">["_id"]) {
  close(spendingId);
}
</script>

<template>
  <USlideover v-model="isOpen" :title="title ?? 'Edit Spending'" :close="{ color: 'neutral' }">
    <template #body>
      <SpendingEdit :spending="spending" @updated="handleUpdated" />
    </template>
  </USlideover>
</template>
