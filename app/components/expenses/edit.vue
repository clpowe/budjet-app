<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { legacyDollarsToCents } from "../../../shared/utils/money-cents";

const props = defineProps<{
  expense: Doc<"expenses">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"expenses">["_id"]) => void>();

const { formatDateInput, toTransactionTimestamp } = useDate();

const makeFormState = (expense: Doc<"expenses">) => ({
  name: expense.name,
  notes: expense.notes,
  amount: expense.amount,
  date: formatDateInput(new Date(expense.date)),
});

const formState = ref(makeFormState(props.expense));

const { mutate: editSpending, isPending: isSaving } = useConvexMutation(api.expenses.updateExpense);

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
  if (isSaving.value) return;

  const { name, notes, amount, date } = formState.value;

  await editSpending({
    expenseId: props.expense._id,
    name,
    notes,
    amountCents: legacyDollarsToCents(amount),
    date: toTransactionTimestamp(date),
  });

  emit("updated", props.expense._id);
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="true"
    :is-submitting="isSaving"
    submit-label="Update"
    @submit="handleSubmit"
  />
</template>
