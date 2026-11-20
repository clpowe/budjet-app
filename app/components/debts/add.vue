<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import { legacyDollarsToCents } from "../../../shared/utils/money-cents";

const makeFormState = () => ({ name: "", amount: Number.NaN, isPriority: false });

const formState = ref(makeFormState());
const submitError = ref("");

const { mutate, isPending: isSaving } = useConvexMutation(api.debts.createDebt);

async function handleSubmit() {
  if (isSaving.value) return;

  const { name, amount, isPriority } = formState.value;
  if (!Number.isFinite(amount)) return;

  submitError.value = "";

  try {
    await mutate({
      creditor: name,
      paymentCents: legacyDollarsToCents(amount),
      isPriority: Boolean(isPriority),
    });

    formState.value = makeFormState();
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : "Could not add debt. Try again.";
  }
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="false"
    show-priority
    :is-submitting="isSaving"
    :errors="{ form: submitError || undefined }"
    submit-label="Add debt"
    @submit="handleSubmit"
  />
</template>
