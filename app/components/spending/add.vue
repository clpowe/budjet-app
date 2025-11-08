<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {})

const name = ref('')
const notes = ref('')
const value = ref(0)
const date = ref()
const { mutate: add } = useConvexMutation(api.spending.addSpending)

async function handleSubmit() {
  if (!user) return
  console.log(date.value)
  add({
    name: name.value,
    notes: notes.value,
    value: value.value,
    date: new Date(date.value).getTime(),
    month: formatDate(date.value),
    householdId: user.value?.householdId
  })


  function formatDate(dateString: string) {
    const [year, month] = dateString.split('-').map(Number);
    if (!year || !month) return '';
    const date = new Date(year, month - 1);
    const monthName = date.toLocaleString('default', { month: 'long' });
    return `${monthName.toLowerCase()} ${year}`;
  }
}
</script>
<template>
  <form class="" @submit.prevent="handleSubmit">
    <label>
      Name
      <input v-model="name" />
    </label>

    <label>
      Notes
      <textarea v-model="notes" />
    </label>

    <label>
      Value
      <input v-model.number="value" step="0.01" type="number" />
    </label>

    <label>
      Date
      <input type="date" v-model="date" />
    </label>

    <UButton type="submit">
      Add Spending
    </UButton>
  </form>
</template>

<style scoped>
form {
  display: grid;
}

label {
  display: grid;
}
</style>
