<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  spending: Doc<"spending">;
}>();

const emit = defineEmits<{
  (e: "updated", spendingId: Doc<"spending">["_id"]): void;
}>();

const name = ref(props.spending.name);
const notes = ref(props.spending.notes);
const value = ref(props.spending.value);
const date = ref(formatDateInput(props.spending.date));

const { mutate: editSpending } = useConvexMutation(api.spending.editSpending);

watch(
  () => props.spending,
  (updated) => {
    if (!updated) return;
    name.value = updated.name;
    notes.value = updated.notes;
    value.value = updated.value;
    date.value = formatDateInput(updated.date);
  },
  { deep: true }
);

function formatDateInput(timestamp?: number) {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split("T")[0];
}

function toLocalMidnightTimestamp(dateString?: string) {
  if (!dateString) return props.spending.date;
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
}

async function handleSubmit() {
  await editSpending({
    spendingId: props.spending._id,
    name: name.value,
    notes: notes.value,
    value: value.value,
    date: toLocalMidnightTimestamp(date.value),
    month: date.value ? formatDate(date.value) : props.spending.month,
  });

  emit("updated", props.spending._id);
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <label>
      Name
      <input v-model="name" />
    </label>

    <label>
      Notes
      <textarea v-model="notes" />
    </label>

    <label>
      Value
      <input v-model.number="value" step="0.01" type="number" />
    </label>

    <label>
      Date
      <input v-model="date" type="date" />
    </label>

    <UButton type="submit">
      Update Spending
    </UButton>
  </form>
</template>

<style scoped>
form {
  display: grid;
}

label {
  display: grid;
}
</style>
