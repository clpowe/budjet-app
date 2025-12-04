<script setup>
import { api } from "../../../convex/_generated/api";

const name = ref("");
const { mutate } = useConvexMutation(api.households.createHousehold);
const { user } = useUser();

const { syncUser } = useHousehold();
async function handleSubmit() {
  syncUser();
  mutate({
    name: name.value,
  });
  user.value.update({
    unsafeMetadata: {
      profileComplete: true,
    },
  });
}
</script>

<template></template>
