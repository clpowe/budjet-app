<script setup lang="ts">
import { format, tzDate } from "@formkit/tempo";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  expense: Doc<"expenses">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"expenses">["_id"]) => void>();

// Build the initial form state
const makeFormState = (expense: Doc<"expenses">) => ({
  name: expense.name,
  notes: expense.notes,
  amount: expense.amount,
  date: format({
    date: new Date(expense.date),
    format: "YYYY-MM-DD",
    tz: "America/New_York",
  }),
});

const formState = ref(makeFormState(props.expense));

const { mutate: editSpending } = useConvexMutation(api.expenses.updateExpense);

// Keep form in sync if parent passes a new expense
watch(
  () => props.expense,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
  },
  { deep: true },
);

// biome-ignore lint/correctness/noUnusedVariables: used as submit handler in template
async function handleSubmit() {
  const { name, notes, amount, date } = formState.value;

  await editSpending({
    expenseId: props.expense._id,
    name,
    notes,
    amount,
    date: new Date(tzDate(date, "America/New_York")).getTime(),
  });

  emit("updated", props.expense._id);
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="true"
    submit-label="Update"
    @submit="handleSubmit"
  />
</template>
