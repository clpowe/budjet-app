<script setup lang="ts">
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  extraDollar: Doc<"extraDollars">;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "close", value?: Doc<"extraDollars">["_id"]): void;
}>();

const isOpen = ref(true);
const pendingCloseValue = ref<Doc<"extraDollars">["_id"] | undefined>();

watch(
  () => isOpen.value,
  (open, previous) => {
    if (!open && previous) {
      emit("close", pendingCloseValue.value);
      pendingCloseValue.value = undefined;
    }
  }
);

function close(payload?: Doc<"extraDollars">["_id"]) {
  pendingCloseValue.value = payload;
  isOpen.value = false;
}

function handleUpdated(extraDollarsID: Doc<"extraDollars">["_id"]) {
  close(extraDollarsID);
}
</script>

<template>
  <USlideover v-model="isOpen" :title="title ?? 'Edit Spending'" :close="{ color: 'neutral' }">
    <template #body>
      <extra-edit :extraDollar="extraDollar" @updated="handleUpdated" />
    </template>
  </USlideover>
</template>
