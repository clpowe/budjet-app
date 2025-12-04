<script setup lang="ts">
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  depts: Doc<"debts">;
}>();

const emit = defineEmits<(e: "updated", id: Doc<"debts">["_id"]) => void>();

const makeFormState = (dept: Doc<"debts">) => ({
  name: dept.creditor,
  amount: dept.payment,
});

const formState = ref(makeFormState(props.depts));
const { update } = useDepts();

// biome-ignore lint/correctness/noUnusedVariables: used as submit handler in template
async function handleSubmit() {
  const { name, amount } = formState.value;

  await update({
    id: props.depts._id,
    creditor: name,
    payment: amount,
  });

  emit("updated", props.depts._id);
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="false"
    :show-priority="false"
    submit-label="Update"
    @submit="handleSubmit"
  />
</template>
