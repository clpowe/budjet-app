<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import { format, tzDate } from "@formkit/tempo";

const props = defineProps<{
  drawerId?: string;
}>();

const { data: user } = useConvexQuery(api.users.getCurrentUser, {});

const today = format({
  date: new Date(),
  format: "YYYY-MM-DD",
  tz: "America/New_York",
});

const name = ref("");
const notes = ref("");
const value = ref(0);
const date = ref(today);
const { mutate: add } = useConvexMutation(api.windfall.addWindfallTransaction);

async function handleSubmit() {
  if (!user || !user.value?.householdId) return;
  await add({
    source: name.value,
    notes: notes.value,
    amount: value.value,
    householdId: user.value?.householdId,
    date: new Date(tzDate(date.value, "America/New_York")).getTime(),
  });

  // Reset form and close the drawer if provided.
  name.value = "";
  notes.value = "";
  value.value = 0;

  if (props.drawerId) {
    const toggle = document.getElementById(
      props.drawerId,
    ) as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }
}
</script>
<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col space-y-4">
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
      <input v-model.number="value" type="text" class="input" />
    </label>

    <label class="input">
      <span class="label">Date</span>
      <input type="date" v-model="date" />
    </label>

    <button class="btn btn-primary" type="submit">Add Dollars</button>
  </form>
</template>
