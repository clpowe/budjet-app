<script setup lang="ts">
import { api } from "../../../convex/_generated/api";

const makeFormState = () => ({
  name: "",
  amount: 0,
});

const formState = ref(makeFormState());
const { mutate, isPending: isSaving, error: createError } = useConvexMutation(api.depts.createDebt);

async function handleSubmit() {
  if (isSaving.value) return;

  const res = await mutate({
    creditor: formState.value.name,
    payment: formState.value.amount,
    isPriority: false,
  });

  if (res.success) {
    formState.value = makeFormState();
  }
}
</script>

<template>
  <transactions-form
    v-model="formState"
    :show-date="false"
    :show-priority="false"
    :is-submitting="isSaving"
    :errors="{ form: createError?.message }"
    submit-label="Add Spending"
    @submit="handleSubmit"
  />
</template>
