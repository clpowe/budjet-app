<script setup lang="ts">
/**
 * Generic transaction form used for both expenses and windfalls.
 * - Keeps no business logic: just form fields + emits events
 * - Parents control submission and data mapping
 */

const props = defineProps<{
  modelValue: {
    name: string;
    notes: string;
    amount: number;
    date?: string | null;
  };
  showDate?: boolean;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: typeof props.modelValue): void;
  (e: "submit"): void;
}>();

// Local computed "fields" that proxy into modelValue
const updateField = <K extends keyof typeof props.modelValue>(
  key: K,
  value: (typeof props.modelValue)[K]
) => {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
};

const onSubmit = () => {
  emit("submit");
};
</script>

<template>
  <form @submit.prevent="onSubmit">
    <label>
      Name
      <input :value="modelValue.name" @input="updateField('name', ($event.target as HTMLInputElement).value)" />
    </label>

    <label>
      Notes
      <textarea :value="modelValue.notes" @input="updateField('notes', ($event.target as HTMLTextAreaElement).value)" />
    </label>

    <label>
      Amount
      <input type="number" step="0.01" :value="modelValue.amount" @input="
        updateField(
          'amount',
          Number(($event.target as HTMLInputElement).value || 0)
        )
        " />
    </label>

    <label v-if="showDate">
      Date
      <input type="date" :value="modelValue.date ?? ''" @input="
        updateField('date', ($event.target as HTMLInputElement).value || null)
        " />
    </label>

    <button type="submit">
      {{ submitLabel || "Save" }}
    </button>
  </form>
</template>
