<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  depts: Doc<"debts">;
}>();

const emit = defineEmits<{
  (e: "updated", id: Doc<"debts">["_id"]): void;
}>();

const makeFormState = (dept: Doc<"debts">) => ({
  name: dept.creditor,
  amount: dept.payment,
  priority: dept.isPriority,
});

const formState = ref(makeFormState(props.depts));

const { mutate } = useConvexMutation(
  api.depts.updateDept)

watch(
  () => props.depts,
  (updated) => {
    if (!updated) return;
    formState.value = makeFormState(updated);
  },
  { deep: true }
);

async function handleSubmit() {
  const { name, amount, priority } = formState.value;

  await mutate({
    id: props.depts._id,
    creditor: name,
    payment: amount,
    priority,
  });


  emit("updated", props.depts._id);
}
</script>

<template>
  <transactions-form v-model="formState" :show-date="false" submit-label="Update" @submit="handleSubmit" />
</template>
