<script setup lang="ts">
import { useForm } from "@tanstack/vue-form";
import { useId, watch } from "vue";

type TransactionFormField = "name" | "amount" | "date";
type TransactionFormErrors = Partial<Record<TransactionFormField | "form", string>>;
type TransactionModel = {
  name: string;
  notes?: string;
  amount: number;
  isPriority?: boolean;
  date?: string | null;
};
type TransactionFormValues = Omit<TransactionModel, "amount"> & {
  amount: number | "";
};

const props = defineProps<{
  modelValue: TransactionModel;
  showDate?: boolean;
  showPriority?: boolean;
  submitLabel?: string;
  isSubmitting?: boolean;
  disabled?: boolean;
  errors?: TransactionFormErrors;
}>();

const emit = defineEmits<
  ((e: "update:modelValue", value: TransactionModel) => void) & ((e: "submit") => void)
>();

const toFormValues = (value: TransactionModel): TransactionFormValues => ({
  ...value,
  amount: Number.isFinite(value.amount) ? value.amount : "",
});

const validateName = ({ value }: { value: string }) => {
  return props.errors?.name ?? (value.trim() ? undefined : "Enter a name.");
};

const validateAmount = ({ value }: { value: number | "" }) => {
  if (props.errors?.amount) return props.errors.amount;
  if (value === "" || !Number.isFinite(value)) return "Enter an amount.";
  return value > 0 ? undefined : "Amount must be greater than $0.00.";
};

const validateDate = ({ value }: { value?: string | null }) => {
  if (props.errors?.date) return props.errors.date;
  return value ? undefined : "Choose a date.";
};

const form = useForm({
  defaultValues: toFormValues(props.modelValue),
  onSubmit: () => {
    if (props.disabled || props.isSubmitting) return;
    emit("submit");
  },
});

const updateModel = <K extends keyof TransactionModel>(key: K, value: TransactionModel[K]) => {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
};

const handleAmountInput = (event: Event, handleChange: (value: number | "") => void) => {
  const input = event.target as HTMLInputElement;

  if (!input.value) {
    handleChange("");
    return;
  }

  handleChange(input.valueAsNumber);
  if (Number.isFinite(input.valueAsNumber)) {
    updateModel("amount", input.valueAsNumber);
  }
};

const fieldErrors = (errors: unknown[], externalError?: string) => {
  const messages = errors.map(String);
  if (externalError && !messages.includes(externalError)) messages.push(externalError);
  return messages;
};

const showPriority = computed(() => props.showPriority ?? true);
const isDisabled = computed(() => Boolean(props.disabled || props.isSubmitting));
const formId = useId();
const fieldErrorIds: Record<TransactionFormField, string> = {
  name: `${formId}-name-error`,
  amount: `${formId}-amount-error`,
  date: `${formId}-date-error`,
};
const formErrorId = `${formId}-form-error`;
const priorityDescriptionId = `${formId}-priority-description`;

watch(
  () => props.modelValue,
  (nextValue) => {
    const next = toFormValues(nextValue);
    const current = form.state.values;

    if (
      current.name === next.name &&
      current.notes === next.notes &&
      current.amount === next.amount &&
      current.isPriority === next.isPriority &&
      current.date === next.date
    ) {
      return;
    }

    form.reset(next);
  },
  { deep: true },
);
</script>

<template>
  <form class="flex flex-col space-y-4" novalidate @submit.prevent="form.handleSubmit">
    <form.Field
      name="name"
      :validators="{
        onChange: validateName,
        onSubmit: validateName,
      }"
    >
      <template #default="{ field }">
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
            <span class="label">Name</span>
            <input
              :id="`${formId}-${field.name}`"
              :name="field.name"
              :value="field.state.value"
              :aria-describedby="
                fieldErrors(field.state.meta.errors, errors?.name).length
                  ? fieldErrorIds.name
                  : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched &&
                fieldErrors(field.state.meta.errors, errors?.name).length > 0
              "
              :disabled="isDisabled"
              class="input w-full"
              required
              @blur="field.handleBlur"
              @input="
                field.handleChange(($event.target as HTMLInputElement).value);
                updateModel('name', ($event.target as HTMLInputElement).value);
              "
            />
          </label>
          <p
            v-if="
              field.state.meta.isTouched &&
              fieldErrors(field.state.meta.errors, errors?.name).length > 0
            "
            :id="fieldErrorIds.name"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors, errors?.name).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <form.Field v-if="modelValue.notes !== undefined" name="notes">
      <template #default="{ field }">
        <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
          <span class="label">Notes</span>
          <textarea
            :id="`${formId}-${field.name}`"
            :name="field.name"
            :value="field.state.value"
            :disabled="isDisabled"
            class="textarea min-h-24 w-full"
            @blur="field.handleBlur"
            @input="
              field.handleChange(($event.target as HTMLTextAreaElement).value);
              updateModel('notes', ($event.target as HTMLTextAreaElement).value);
            "
          />
        </label>
      </template>
    </form.Field>

    <form.Field
      name="amount"
      :validators="{
        onChange: validateAmount,
        onSubmit: validateAmount,
      }"
    >
      <template #default="{ field }">
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
            <span class="label">Amount</span>
            <input
              :id="`${formId}-${field.name}`"
              :name="field.name"
              type="number"
              inputmode="decimal"
              min="0.01"
              step="0.01"
              :value="field.state.value"
              :aria-describedby="
                fieldErrors(field.state.meta.errors, errors?.amount).length
                  ? fieldErrorIds.amount
                  : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched &&
                fieldErrors(field.state.meta.errors, errors?.amount).length > 0
              "
              :disabled="isDisabled"
              class="input w-full"
              required
              @blur="field.handleBlur"
              @input="handleAmountInput($event, field.handleChange)"
            />
          </label>
          <p
            v-if="
              field.state.meta.isTouched &&
              fieldErrors(field.state.meta.errors, errors?.amount).length > 0
            "
            :id="fieldErrorIds.amount"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors, errors?.amount).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <form.Field v-if="showPriority" name="isPriority">
      <template #default="{ field }">
        <label class="flex min-h-11 items-center justify-between gap-3">
          <span class="label">Mark as important</span>
          <input
            :name="field.name"
            :checked="field.state.value"
            type="checkbox"
            :aria-describedby="priorityDescriptionId"
            :disabled="isDisabled"
            class="checkbox"
            @blur="field.handleBlur"
            @change="
              field.handleChange(($event.target as HTMLInputElement).checked);
              updateModel('isPriority', ($event.target as HTMLInputElement).checked);
            "
          />
        </label>
        <p :id="priorityDescriptionId" class="-mt-3 text-sm text-base-content/60">
          Use for transactions you want to keep easy to spot.
        </p>
      </template>
    </form.Field>

    <form.Field
      v-if="showDate"
      name="date"
      :validators="{
        onChange: validateDate,
        onSubmit: validateDate,
      }"
    >
      <template #default="{ field }">
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
            <span class="label">Date</span>
            <input
              :id="`${formId}-${field.name}`"
              :name="field.name"
              type="date"
              :value="field.state.value ?? ''"
              :aria-describedby="
                fieldErrors(field.state.meta.errors, errors?.date).length
                  ? fieldErrorIds.date
                  : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched &&
                fieldErrors(field.state.meta.errors, errors?.date).length > 0
              "
              :disabled="isDisabled"
              class="input w-full"
              required
              @blur="field.handleBlur"
              @input="
                field.handleChange(($event.target as HTMLInputElement).value || null);
                updateModel('date', ($event.target as HTMLInputElement).value || null);
              "
            />
          </label>
          <p
            v-if="
              field.state.meta.isTouched &&
              fieldErrors(field.state.meta.errors, errors?.date).length > 0
            "
            :id="fieldErrorIds.date"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors, errors?.date).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <p
      v-if="errors?.form"
      :id="formErrorId"
      class="text-sm text-error"
      role="alert"
      aria-live="polite"
    >
      {{ errors.form }}
    </p>

    <form.Subscribe
      :selector="
        (state) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
        })
      "
    >
      <template #default="{ canSubmit, isSubmitting: isFormSubmitting }">
        <button
          type="submit"
          class="btn btn-primary w-full"
          :aria-busy="isSubmitting || isFormSubmitting ? 'true' : undefined"
          :aria-describedby="errors?.form ? formErrorId : undefined"
          :disabled="isDisabled || !canSubmit || isFormSubmitting"
        >
          {{ isSubmitting || isFormSubmitting ? "Saving..." : submitLabel || "Save" }}
        </button>
      </template>
    </form.Subscribe>
  </form>
</template>
