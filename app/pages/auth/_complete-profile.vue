<script setup lang="ts">

import { api } from "../../../convex/_generated/api";

// Get the logged-in user's data from our `users` table
const { data: myUser, isPending } = useConvexQuery(api.users.getCurrentUser, {})
console.log(myUser.value)

// Get the mutations
const createHousehold = useConvexMutation(api.households.createHousehold)
const joinHousehold = useConvexMutation(api.households.joinHousehold)

// Form state
const newHouseholdName = ref('')
const inviteCode = ref('')

// Handle form submissions
async function handleCreate() {
  if (!newHouseholdName.value) return
  try {
    await createHousehold.mutate({ name: newHouseholdName.value })
    // The query will automatically re-run, and the watcher below will redirect.
  } catch (e) {
    alert(e.message)
  }
}



// Watch the user data

</script>

<template>

  <div>
    <SignOutButton />
    <div>Loading...</div>

    <div>
      <h1>Welcome, {{ myUser.name }}!</h1>
      <p>Please create a new household or join an existing one.</p>

      <form @submit.prevent="handleCreate">
        <h2>Create a Household</h2>
        <label>
          Household Name:
          <input v-model="newHouseholdName" type="text" />
        </label>
        <button type="submit" :disabled="createHousehold.isPending">
          Create
        </button>
      </form>

      <hr />

      <form @submit.prevent="handleJoin">
        <h2>Join a Household</h2>
        <label>
          Invite Code:
          <input v-model="inviteCode" type="text" />
        </label>
        <button type="submit" :disabled="joinHousehold.isPending">
          Join
        </button>
      </form>
    </div>
  </div>
</template>
