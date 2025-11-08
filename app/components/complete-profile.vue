<script setup>
import { api } from "../../convex/_generated/api";

const name = ref('')
const inviteCode = ref('')
const { mutate: create } = useConvexMutation(api.households.createHousehold)

const { mutate: join } = useConvexMutation(api.households.joinHousehold)


const { syncUser } = useHousehold()
async function handleSubmit() {
  syncUser()
  create({
    name: name.value
  })

}
async function handleSubmitJoin() {
  syncUser()
  join({
    inviteCode: inviteCode.value
  })
}
</script>

<template>
  <div>
    <div>
      <h1>
        Complete your profile
      </h1>

      <form @submit.prevent="handleSubmit">
        <label>Household Name
          <input v-model="name" type="text" name="name" placeholder="Household Name">
        </label>
        <button>sign up</button>
      </form>
    </div>
    <div>
      <h1>
        Join a Household
      </h1>

      <form @submit.prevent="handleSubmitJoin()">
        <label>Household Name
          <input v-model="inviteCode" type="text" name="inviteCode" placeholder="inviteCode">
        </label>
        <button>Join</button>
      </form>
    </div>
  </div>

</template>
