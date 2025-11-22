<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  windfall: Doc<"windfall">;
}>();

const emit = defineEmits<{
  (e: "updated", id: Doc<"windfall">["_id"]): void;
}>();

const makeFormState = (windfall: Doc<"windfall">) => ({
  name: windfall.source,
  notes: windfall.notes,
  amount: windfall.amount,
  // no date for windfall
  date: null as string | null,
});

const formState = ref(makeFormState(props.windfall));

const { mutate: editWindfall } = useConvexMutation(
  api.windfall.updateWindfall
);

watch(
  () => props.windfall,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
  },
  { deep: true }
);

async function handleSubmit() {
  const { name, notes, amount } = formState.value;

  await editWindfall({
    windfallId: props.windfall._id,
    source: name,
    notes,
    amount,
    householdId: props.windfall.householdId,
  });

  emit("updated", props.windfall._id);
}
</script>

<template>
  <transactions-form v-model="formState" :show-date="false" submit-label="Update" @submit="handleSubmit" />
</template>
