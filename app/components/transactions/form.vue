<script setup lang="ts">
import { useId, watch } from "vue";

/**
 * Generic transaction form used for expenses, windfalls, and debts.
 * - Keeps no business logic: just form fields + emits events
 * - Parents control submission and data mapping
 */

type TransactionFormField = "name" | "amount" | "date";
type TransactionFormErrors = Partial<Record<TransactionFormField | "form", string>>;

const props = defineProps<{
  modelValue: {
    name: string;
    notes?: string;
    amount: number;
    isPriority?: boolean;
    date?: string | null;
  };
  showDate?: boolean;
  showPriority?: boolean;
  submitLabel?: string;
  isSubmitting?: boolean;
  disabled?: boolean;
  errors?: TransactionFormErrors;
}>();

const emit = defineEmits<
  ((e: "update:modelValue", value: typeof props.modelValue) => void) & ((e: "submit") => void)
>();

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
  submitAttempted.value = true;
  markAllTouched();

  if (hasErrors.value || isDisabled.value) return;

  emit("submit");
};

const showPriority = computed(() => props.showPriority ?? true);
const formId = useId();
const submitAttempted = ref(false);
const amountInput = ref(String(props.modelValue.amount));
const touched = ref<Record<TransactionFormField, boolean>>({
  name: false,
  amount: false,
  date: false,
});

const isDisabled = computed(() => Boolean(props.disabled || props.isSubmitting));

const fieldErrorIds: Record<TransactionFormField, string> = {
  name: `${formId}-name-error`,
  amount: `${formId}-amount-error`,
  date: `${formId}-date-error`,
};
const formErrorId = `${formId}-form-error`;
const priorityDescriptionId = `${formId}-priority-description`;

const validationErrors = computed<TransactionFormErrors>(() => {
  const errors: TransactionFormErrors = {};
  const amount = Number(amountInput.value);

  if (!props.modelValue.name.trim()) {
    errors.name = "Enter a name.";
  }

  if (!amountInput.value.trim() || !Number.isFinite(amount)) {
    errors.amount = "Enter an amount.";
  } else if (amount <= 0) {
    errors.amount = "Amount must be greater than $0.00.";
  }

  if (props.showDate && !props.modelValue.date) {
    errors.date = "Choose a date.";
  }

  return errors;
});

const mergedErrors = computed<TransactionFormErrors>(() => ({
  ...validationErrors.value,
  ...props.errors,
}));

const hasErrors = computed(() => {
  return Object.values(mergedErrors.value).some(Boolean);
});

const visibleError = (field: TransactionFormField) => {
  if (!touched.value[field] && !submitAttempted.value) return "";
  return mergedErrors.value[field] ?? "";
};

const describedBy = (field: TransactionFormField) => {
  return visibleError(field) ? fieldErrorIds[field] : undefined;
};

const markTouched = (field: TransactionFormField) => {
  touched.value[field] = true;
};

const markAllTouched = () => {
  touched.value.name = true;
  touched.value.amount = true;
  touched.value.date = true;
};

const updateAmount = (value: string) => {
  amountInput.value = value;

  const amount = Number(value);
  if (!value.trim() || !Number.isFinite(amount)) return;

  updateField("amount", amount);
};

watch(
  () => props.modelValue.amount,
  (amount) => {
    amountInput.value = Number.isFinite(amount) ? String(amount) : "";
  },
);
</script>

<template>
  <form class="flex flex-col space-y-4" novalidate @submit.prevent="onSubmit">
    <div class="flex flex-col gap-1">
      <label class="flex flex-col gap-1">
        <span class="label">Name</span>
        <input
          :value="modelValue.name"
          :aria-describedby="describedBy('name')"
          :aria-invalid="Boolean(visibleError('name'))"
          :disabled="isDisabled"
          @input="updateField('name', ($event.target as HTMLInputElement).value)"
          @blur="markTouched('name')"
          class="input w-full"
          required
        />
      </label>
      <p
        v-if="visibleError('name')"
        :id="fieldErrorIds.name"
        class="text-sm text-error"
        role="alert"
      >
        {{ visibleError("name") }}
      </p>
    </div>

    <div v-if="modelValue.notes !== undefined" class="flex flex-col gap-1">
      <label class="flex flex-col gap-1">
        <span class="label">Notes</span>
        <textarea
          :value="modelValue.notes"
          :disabled="isDisabled"
          @input="updateField('notes', ($event.target as HTMLTextAreaElement).value)"
          class="textarea min-h-24 w-full"
        />
      </label>
    </div>

    <div class="flex flex-col gap-1">
      <label class="flex flex-col gap-1">
        <span class="label">Amount</span>
        <input
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          :value="amountInput"
          :aria-describedby="describedBy('amount')"
          :aria-invalid="Boolean(visibleError('amount'))"
          :disabled="isDisabled"
          @input="updateAmount(($event.target as HTMLInputElement).value)"
          @blur="markTouched('amount')"
          class="input w-full"
          required
        />
      </label>
      <p
        v-if="visibleError('amount')"
        :id="fieldErrorIds.amount"
        class="text-sm text-error"
        role="alert"
      >
        {{ visibleError("amount") }}
      </p>
    </div>

    <label v-if="showPriority" class="flex min-h-11 items-center justify-between gap-3">
      <span class="label">Mark as important</span>
      <input
        :checked="modelValue.isPriority"
        type="checkbox"
        :aria-describedby="priorityDescriptionId"
        :disabled="isDisabled"
        @change="updateField('isPriority', ($event.target as HTMLInputElement).checked)"
        class="checkbox"
      />
    </label>
    <p v-if="showPriority" :id="priorityDescriptionId" class="-mt-3 text-sm text-base-content/60">
      Use for transactions you want to keep easy to spot.
    </p>

    <div v-if="showDate" class="flex flex-col gap-1">
      <label class="flex flex-col gap-1">
        <span class="label">Date</span>
        <input
          type="date"
          :value="modelValue.date ?? ''"
          :aria-describedby="describedBy('date')"
          :aria-invalid="Boolean(visibleError('date'))"
          :disabled="isDisabled"
          @input="updateField('date', ($event.target as HTMLInputElement).value || null)"
          @blur="markTouched('date')"
          class="input w-full"
          required
        />
      </label>
      <p
        v-if="visibleError('date')"
        :id="fieldErrorIds.date"
        class="text-sm text-error"
        role="alert"
      >
        {{ visibleError("date") }}
      </p>
    </div>

    <p
      v-if="errors?.form"
      :id="formErrorId"
      class="text-sm text-error"
      role="alert"
      aria-live="polite"
    >
      {{ errors.form }}
    </p>

    <button
      type="submit"
      class="btn btn-primary w-full"
      :aria-busy="isSubmitting ? 'true' : undefined"
      :aria-describedby="errors?.form ? formErrorId : undefined"
      :disabled="isDisabled"
    >
      {{ isSubmitting ? "Saving..." : submitLabel || "Save" }}
    </button>
  </form>
</template>
