<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { legacyDollarsToCents } from "../../../shared/utils/money-cents";

const props = defineProps<{
  windfall: Doc<"income">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"income">["_id"]) => void>();

const makeFormState = (windfall: Doc<"income">) => ({
  name: windfall.source,
  notes: windfall.notes,
  amount: Number(windfall.amountCents) / 100,
  // the date is not editable here
  date: null as string | null,
});

const formState = ref(makeFormState(props.windfall));

const { mutate: editWindfall, isPending: isSaving } = useConvexMutation(api.income.updateIncome);

watch(
  () => props.windfall,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
  },
  { deep: true },
);

async function handleSubmit() {
  if (isSaving.value) return;

  const { name, notes, amount } = formState.value;

  await editWindfall({
    incomeId: props.windfall._id,
    source: name,
    notes,
    amountCents: legacyDollarsToCents(amount),
  });

  emit("updated", props.windfall._id);
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
