<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {})

const name = ref('')
const notes = ref('')
const value = ref(0)
const { mutate: add } = useConvexMutation(api.extraDollars.addExtraDollars)


async function handleSubmit() {

  if (!user || !user.value?.householdId) return
  add({
    name: name.value,
    notes: notes.value,
    value: value.value,
    householdId: user.value?.householdId
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

    <button type="submit">
      Add Dollars
    </button>
  </form>
</template>