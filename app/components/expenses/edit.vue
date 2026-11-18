<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { legacyDollarsToCents } from "../../../shared/utils/money-cents";

const props = withDefaults(defineProps<{ expense: Doc<"expenses">; submitLabel?: string }>(), {
  submitLabel: "Update",
});

const emit = defineEmits<(e: "updated", id: Doc<"expenses">["_id"]) => void>();

const { formatDateInput } = useDate();

function expenseLocalDate(expense: Doc<"expenses">) {
  return expense.localDate ?? formatDateInput(new Date(expense.date));
}

const makeFormState = (expense: Doc<"expenses">) => ({
  name: expense.name,
  notes: expense.notes,
  amount: expense.amount,
  date: expenseLocalDate(expense),
});

const formState = ref(makeFormState(props.expense));
const originalLocalDate = ref(formState.value.date);
const submitError = ref("");

const { mutate: updateExpense, isPending: isSaving } = useConvexMutation(
  api.expenses.updateExpense,
);

watch(
  () => props.expense,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
    originalLocalDate.value = formState.value.date;
  },
  { deep: true },
);

async function handleSubmit() {
  if (isSaving.value) return;

  const { name, notes, amount, date } = formState.value;

  submitError.value = "";

  try {
    const result = await updateExpense({
      apiVersion: 2,
      expenseId: props.expense._id,
      name,
      notes,
      amountCents: legacyDollarsToCents(amount),
      ...(date === originalLocalDate.value ? {} : { localDate: date }),
    });

    if (!result.success) {
      submitError.value = "Savings are still syncing. Try again in a moment.";
      return;
    }
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : "Could not update spending. Try again.";
    return;
  }

  emit("updated", props.expense._id);
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="true"
    :is-submitting="isSaving"
    :errors="{ form: submitError || undefined }"
    :submit-label="submitLabel"
    @submit="handleSubmit"
  />
</template>
