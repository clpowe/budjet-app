<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const props = defineProps<{
  extraDollar: Doc<"extraDollars">;
}>();

const emit = defineEmits<{
  (e: "updated", spendingId: Doc<"extraDollars">["_id"]): void;
}>();

const name = ref(props.extraDollar.name);
const notes = ref(props.extraDollar.notes);
const value = ref(props.extraDollar.value);

const { mutate: editSpending } = useConvexMutation(api.extraDollars.editExtraDollars);

watch(
  () => props.extraDollar,
  (updated) => {
    if (!updated) return;
    name.value = updated.name;
    notes.value = updated.notes;
    value.value = updated.value;
  },
  { deep: true }
);



async function handleSubmit() {
  await editSpending({
    extraDollarId: props.extraDollar._id,
    name: name.value,
    notes: notes.value,
    value: value.value,
    householdId: props.extraDollar.householdId,
  });

  emit("updated", props.extraDollar._id);
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
      Update
    </button>
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
