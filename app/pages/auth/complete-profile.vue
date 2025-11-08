<script setup>


import { api } from "../../../convex/_generated/api";

const name = ref('')
const { mutate } = useConvexMutation(api.households.createHousehold)
const { user } = useUser()

const { syncUser } = useHousehold()
async function handleSubmit() {
  syncUser()
  mutate({
    name: name.value
  })
  user.value.update({
    unsafeMetadata: {
      profileComplete: true,
    }
  })
}
</script>

<template>
  <div>
    <ClerkLoaded>
      <h1>
        Complete your profile
      </h1>

      <form @submit.prevent="handleSubmit">
        <label>Household Name
          <input v-model="name" type="text" name="name" placeholder="Household Name">
        </label>
        <button>sign up</button>
      </form>
    </ClerkLoaded>
  </div>

</template>
