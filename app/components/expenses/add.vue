<script setup lang="ts">
import { api } from "../../../convex/_generated/api";

const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {});
const { currentDate, timeZone, formatDateInput, toTransactionTimestamp } = useDate();

const makeFormState = (date: string) => ({
  name: "",
  notes: "",
  amount: Number.NaN,
  date,
});

const formState = ref(makeFormState(formatDateInput(currentDate.value)));
const submitError = ref("");

watch([currentDate, timeZone], ([nextDate]) => {
  formState.value = {
    ...formState.value,
    date: formatDateInput(nextDate),
  };
});

const {
  mutate,
  isPending: isSaving,
  error: createError,
} = useConvexMutation(api.expenses.createExpense);

const accountMessage = computed(() => {
  if (userLoading.value) return "Loading your account...";
  if (!user.value?.householdId) {
    return "Finish household setup before adding spending.";
  }
  return "";
});

const formError = computed(() => submitError.value || createError.value?.message || "");
const isDisabled = computed(() => userLoading.value || isSaving.value || !user.value?.householdId);

async function handleSubmit() {
  submitError.value = "";
  if (isDisabled.value) return;

  const householdId = user.value?.householdId;
  if (!householdId) {
    submitError.value = "Finish household setup before adding spending.";
    return;
  }

  const { name, notes, amount, date } = formState.value;
  if (!Number.isFinite(amount)) return;

  try {
    const res = await mutate({
      name,
      notes,
      amount,
      date: toTransactionTimestamp(date),
      householdId,
    });

    if (res.success) {
      formState.value = makeFormState(date);
    }
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : "Could not add spending. Try again.";
  }
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="true"
    :show-priority="false"
    :is-submitting="isSaving"
    :disabled="isDisabled"
    :errors="{ form: formError || undefined }"
    submit-label="Add Spending"
    @submit="handleSubmit"
  />

  <p v-if="accountMessage" class="mt-3 text-sm text-base-content/70">
    {{ accountMessage }}
  </p>
</template>
