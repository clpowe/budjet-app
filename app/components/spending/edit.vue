<script setup lang="ts">
import { format, tzDate } from "@formkit/tempo";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  expense: Doc<"expenses">;
}>();

const emit = defineEmits<{
  (e: "updated", spendingId: Doc<"expenses">["_id"]): void;
}>();

const today = format(
  {
    date: new Date(props.expense.date),
    format: "YYYY-MM-DD",
    tz: "America/New_York"
  }
)

const name = ref(props.expense.name);
const notes = ref(props.expense.notes);
const value = ref(props.expense.amount);
const date = ref(today);

const { mutate: editSpending } = useConvexMutation(api.expenses.updateExpense);

watch(
  () => props.expense,
  (updated) => {
    if (!updated) return;
    name.value = updated.name;
    notes.value = updated.notes;
    value.value = updated.amount;
    date.value = format(
      {
        date: new Date(updated.date),
        format: "YYYY-MM-DD",
        tz: "America/New_York"
      }
    )
  },
  { deep: true }
);


async function handleSubmit() {
  await editSpending({
    expenseId: props.expense._id,
    name: name.value,
    notes: notes.value,
    amount: value.value,
    date: new Date(tzDate(date.value, "America/New_York")).getTime(),
  });

  emit("updated", props.expense._id);
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

    <button type="submit">
      Update Spending
    </button>
  </form>
</template>
