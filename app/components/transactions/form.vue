<script setup lang="ts">
/**
 * Generic transaction form used for both expenses and windfalls.
 * - Keeps no business logic: just form fields + emits events
 * - Parents control submission and data mapping
 */

const props = defineProps<{
  modelValue: {
    name: string;
    notes?: string;
    amount: number;
    isPriority?: boolean;
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
  value: (typeof props.modelValue)[K],
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
      <input
        :value="modelValue.name"
        @input="updateField('name', ($event.target as HTMLInputElement).value)"
        class="input"
      />
    </label>

    <label v-if="modelValue.notes !== undefined">
      Notes
      <textarea
        :value="modelValue.notes"
        @input="
          updateField('notes', ($event.target as HTMLTextAreaElement).value)
        "
        class="input"
      />
    </label>

    <label>
      Amount
      <input
        type="number"
        step="0.01"
        :value="modelValue.amount"
        @input="
          updateField(
            'amount',
            Number(($event.target as HTMLInputElement).value || 0),
          )
        "
        class="input"
      />
    </label>

    <label>
      Priority
      <input
        :checked="modelValue.isPriority"
        type="checkbox"
        @change="
          updateField('isPriority', ($event.target as HTMLInputElement).checked)
        "
        class="checkbox"
      />
    </label>

    <label v-if="showDate">
      Date
      <input
        type="date"
        :value="modelValue.date ?? ''"
        @input="
          updateField('date', ($event.target as HTMLInputElement).value || null)
        "
        class=""
      />
    </label>

    <button type="submit" class="btn btn-primary">
      {{ submitLabel || "Save" }}
    </button>
  </form>
</template>
