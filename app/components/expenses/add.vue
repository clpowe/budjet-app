<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {});

import { format, tzDate } from "@formkit/tempo";

const { currentDate } = useDate();

function formatDateInput(date: Date) {
  return format({
    date,
    format: "YYYY-MM-DD",
    tz: "America/New_York",
  });
}

const name = ref("");
const notes = ref("");
const value = ref<number | null>(null);
const date = ref(formatDateInput(currentDate.value));
const submitError = ref("");
const amountTouched = ref(false);

watch(currentDate, (nextDate) => {
  date.value = formatDateInput(nextDate);
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

const formError = computed(() => {
  return submitError.value || createError.value?.message || "";
});

const amountError = computed(() => {
  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    return "Enter a spending amount.";
  }

  if (value.value <= 0) {
    return "Amount must be greater than $0.00.";
  }

  return "";
});

const visibleAmountError = computed(() => {
  return amountTouched.value ? amountError.value : "";
});

const canSubmit = computed(() => {
  return (
    Boolean(user.value?.householdId) && !userLoading.value && !isSaving.value && !amountError.value
  );
});

async function handleSubmit() {
  submitError.value = "";
  amountTouched.value = true;

  if (userLoading.value || isSaving.value) return;

  if (amountError.value) return;
  const amount = value.value;
  if (typeof amount !== "number") return;

  const householdId = user.value?.householdId;
  if (!householdId) {
    submitError.value = "Finish household setup before adding spending.";
    return;
  }

  try {
    const res = await mutate({
      name: name.value,
      notes: notes.value,
      amount,
      date: new Date(tzDate(date.value, "America/New_York")).getTime(),
      householdId,
    });

    if (res.success) {
      name.value = "";
      notes.value = "";
      value.value = null;
      amountTouched.value = false;
    }
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : "Could not add spending. Try again.";
  }
}
</script>
<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col space-y-4">
    <label>
      Name
      <input v-model="name" class="input" />
    </label>

    <label>
      Notes
      <textarea v-model="notes" class="textarea" />
    </label>

    <label>
      Value
      <input
        v-model.number="value"
        type="number"
        class="input"
        inputmode="decimal"
        min="0.01"
        step="0.01"
        required
        aria-describedby="spending-amount-error"
        :aria-invalid="Boolean(visibleAmountError)"
        @blur="amountTouched = true"
      />
    </label>

    <p v-if="visibleAmountError" id="spending-amount-error" class="text-sm text-error" role="alert">
      {{ visibleAmountError }}
    </p>

    <label class="input">
      <span class="label">Date</span>
      <input type="date" v-model="date" />
    </label>

    <p v-if="accountMessage" class="text-sm text-base-content/70">
      {{ accountMessage }}
    </p>

    <p v-if="formError" class="text-sm text-error" role="alert" aria-live="polite">
      {{ formError }}
    </p>

    <button class="btn btn-primary" type="submit" :disabled="!canSubmit">
      {{ isSaving ? "Adding spending..." : "Add Spending" }}
    </button>
  </form>
</template>
