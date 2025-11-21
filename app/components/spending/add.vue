<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {})

import { format, tzDate } from "@formkit/tempo"

const today = format({
  date: new Date(),
  format: "YYYY-MM-DD",
  tz: "America/New_York"
})

const name = ref("")
const notes = ref('')
const value = ref(0)
const date = ref(today)

const { mutate } = useConvexMutation(api.expenses.createExpense)

async function handleSubmit() {
  if (!user || !user.value?.householdId) return;
  mutate({
    name: name.value,
    notes: notes.value,
    amount: value.value,
    date: new Date(tzDate(date.value, "America/New_York")).getTime(),
    householdId: user.value?.householdId!
  })
}
</script>
<template>
  <form @submit.prevent="handleSubmit">
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

    <button type="submit">
      Add Spending
    </button>
  </form>
</template>
