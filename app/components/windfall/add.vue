<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
const { data: user, isPending: userLoading } = useConvexQuery(
  api.users.getCurrentUser,
  {},
);

const name = ref("");
const notes = ref("");
const value = ref(0);
const { mutate: add } = useConvexMutation(api.windfall.addWindfallTransaction);

async function handleSubmit() {
  if (!user || !user.value?.householdId) return;
  const res = await add({
    source: name.value,
    notes: notes.value,
    amount: value.value,
    householdId: user.value?.householdId,
  });
  console.log(res);
}
</script>
<template>
  <form @submit.prevent="handleSubmit">
    <label>
      Name
      <input v-model="name" class="input" />
    </label>

    <label>
      Notes
      <textarea v-model="notes" class="textarea" />
    </label>

    <label>
      Value
      <input v-model.number="value" step="0.01" type="number" class="input" />
    </label>

    <button class="btn btn-primary" type="submit">Add Dollars</button>
  </form>
</template>
