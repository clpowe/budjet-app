<script setup lang="ts">
import { api } from "../../../convex/_generated/api";

const props = defineProps<{
  drawerId?: string;
}>();

const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {});
const { currentDate, timeZone, formatDateInput, toTransactionTimestamp } = useDate();

const makeFormState = (date = formatDateInput(currentDate.value)) => ({
  name: "",
  notes: "",
  amount: 0,
  date,
});

const formState = ref(makeFormState());
const submitError = ref("");
const { mutate: add, isPending: isSaving } = useConvexMutation(api.windfall.addWindfallTransaction);

watch([currentDate, timeZone], ([nextDate]) => {
  formState.value = {
    ...formState.value,
    date: formatDateInput(nextDate),
  };
});

const isDisabled = computed(() => userLoading.value || isSaving.value || !user.value?.householdId);

async function handleSubmit() {
  submitError.value = "";
  if (isDisabled.value) return;

  if (!user.value?.householdId) {
    submitError.value = "Finish household setup before adding a windfall.";
    return;
  }

  const { name, notes, amount, date } = formState.value;

  try {
    await add({
      source: name,
      notes,
      amount,
      date: toTransactionTimestamp(date),
    });

    formState.value = makeFormState();

    if (props.drawerId) {
      (document.getElementById(props.drawerId) as HTMLDialogElement | null)?.close();
    }
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : "Could not add the windfall. Try again.";
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
    :errors="{ form: submitError || undefined }"
    submit-label="Add Dollars"
    @submit="handleSubmit"
  />
</template>
