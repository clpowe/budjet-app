<script setup lang="ts">
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  depts: Doc<"debts">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"debts">["_id"]) => void>();

const makeFormState = (debt: Doc<"debts">) => ({
  name: debt.creditor,
  amount: debt.payment,
});

const formState = ref(makeFormState(props.depts));
const isSaving = ref(false);
const { update } = useDebts();

// biome-ignore lint/correctness/noUnusedVariables: used as submit handler in template
async function handleSubmit() {
  if (isSaving.value) return;

  const { name, amount } = formState.value;

  try {
    isSaving.value = true;
    await update({
      id: props.depts._id,
      creditor: name,
      payment: amount,
    });

    emit("updated", props.depts._id);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="false"
    :show-priority="false"
    :is-submitting="isSaving"
    submit-label="Update"
    @submit="handleSubmit"
  />
</template>
