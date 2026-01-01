<script setup lang="ts">
import { api } from "../../../convex/_generated/api";

const name = ref("");
const value = ref(0);

const { mutate } = useConvexMutation(api.depts.createDebt);

async function handleSubmit() {
  const res = await mutate({
    creditor: name.value,
    payment: value.value,
    isPriority: false,
  });

  if (res.success) {
    name.value = "";
    value.value = 0;
  }

  console.log(res);
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col space-y-4">
    <label>
      Name
      <input v-model="name" class="input" />
    </label>

    <label>
      Value
      <input v-model.number="value" type="text" class="input" />
    </label>

    <button class="btn btn-primary" type="submit">Add Spending</button>
  </form>
</template>
