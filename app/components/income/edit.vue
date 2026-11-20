<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { legacyDollarsToCents } from "../../../shared/utils/money-cents";

const props = defineProps<{
  income: Doc<"income">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"income">["_id"]) => void>();

const makeFormState = (income: Doc<"income">) => ({
  name: income.source,
  notes: income.notes,
  amount: Number(income.amountCents) / 100,
  // the date is not editable here
  date: null as string | null,
});

const formState = ref(makeFormState(props.income));

const { mutate: editIncome, isPending: isSaving } = useConvexMutation(api.income.updateIncome);

watch(
  () => props.income,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
  },
  { deep: true },
);

async function handleSubmit() {
  if (isSaving.value) return;

  const { name, notes, amount } = formState.value;

  await editIncome({
    incomeId: props.income._id,
    source: name,
    notes,
    amountCents: legacyDollarsToCents(amount),
  });

  emit("updated", props.income._id);
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="false"
    :is-submitting="isSaving"
    submit-label="Update"
    @submit="handleSubmit"
  />
</template>
