<script setup lang="ts">
import { useForm } from "@tanstack/vue-form";
import { computed, useId, watch } from "vue";
import { parseMoneyToCents } from "../../../shared/utils/money-cents";

type WantPriority = "high" | "medium" | "low";

type WantFormModel = {
  name: string;
  estimatedCost: string;
  priority: WantPriority | "";
  targetDate: string;
  notes: string;
};

type WantSubmitValues = {
  name: string;
  estimatedCostCents: bigint;
  priority: WantPriority;
  targetDate: number | undefined;
  notes: string;
};

const props = defineProps<{
  modelValue: WantFormModel;
  submitLabel?: string;
  isSubmitting?: boolean;
  disabled?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: WantFormModel): void;
  (event: "submit", value: WantSubmitValues): void;
}>();

const { toTransactionTimestamp } = useDate();

function validateName({ value }: { value: string }) {
  return value.trim() ? undefined : "Enter a name.";
}

function validateEstimatedCost({ value }: { value: string }) {
  if (!value) {
    return "Enter an estimated cost.";
  }

  try {
    const cents = parseMoneyToCents(value);

    return cents > 0n ? undefined : "Estimated cost must be greater than $0.00.";
  } catch (error) {
    return error instanceof Error ? error.message : "Enter a valid estimated cost.";
  }
}

function validatePriority({ value }: { value: WantPriority | "" }) {
  return value ? undefined : "Choose a priority.";
}

const form = useForm({
  defaultValues: {
    ...props.modelValue,
  },
  onSubmit: () => {
    if (props.disabled || props.isSubmitting) return;

    const values = form.state.values;

    if (!values.priority) return;

    const estimatedCostCents = parseMoneyToCents(values.estimatedCost);

    emit("submit", {
      name: values.name,
      estimatedCostCents,
      priority: values.priority,
      targetDate: values.targetDate ? toTransactionTimestamp(values.targetDate) : undefined,
      notes: values.notes,
    });
  },
});

function updateModel<K extends keyof WantFormModel>(key: K, value: WantFormModel[K]) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
}

function fieldErrors(errors: unknown[]) {
  return errors.map(String);
}

const isDisabled = computed(() => Boolean(props.disabled || props.isSubmitting));

const formId = useId();
const nameErrorId = `${formId}-name-error`;
const estimatedCostErrorId = `${formId}-estimated-cost-error`;
const priorityErrorId = `${formId}-priority-error`;
const formErrorId = `${formId}-form-error`;

watch(
  () => props.modelValue,
  (nextValue) => {
    const current = form.state.values;

    if (
      current.name === nextValue.name &&
      current.estimatedCost === nextValue.estimatedCost &&
      current.priority === nextValue.priority &&
      current.targetDate === nextValue.targetDate &&
      current.notes === nextValue.notes
    ) {
      return;
    }

    form.reset({
      ...nextValue,
    });
  },
  { deep: true },
);

function handleSubmit() {
  if (isDisabled.value) return;

  form.handleSubmit();
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="handleSubmit">
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
              :disabled="isDisabled"
              :aria-describedby="
                fieldErrors(field.state.meta.errors).length ? nameErrorId : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0
              "
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
            v-if="field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0"
            :id="nameErrorId"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <form.Field
      name="estimatedCost"
      :validators="{
        onChange: validateEstimatedCost,
        onSubmit: validateEstimatedCost,
      }"
    >
      <template #default="{ field }">
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
            <span class="label">Estimated cost</span>
            <input
              :id="`${formId}-${field.name}`"
              :name="field.name"
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              :value="field.state.value"
              :disabled="isDisabled"
              :aria-describedby="
                fieldErrors(field.state.meta.errors).length ? estimatedCostErrorId : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0
              "
              class="input w-full"
              required
              @blur="field.handleBlur"
              @input="
                field.handleChange(($event.target as HTMLInputElement).value);
                updateModel('estimatedCost', ($event.target as HTMLInputElement).value);
              "
            />
          </label>

          <p
            v-if="field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0"
            :id="estimatedCostErrorId"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <form.Field
      name="priority"
      :validators="{
        onChange: validatePriority,
        onSubmit: validatePriority,
      }"
    >
      <template #default="{ field }">
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
            <span class="label">Priority</span>
            <select
              :id="`${formId}-${field.name}`"
              :name="field.name"
              :value="field.state.value"
              :disabled="isDisabled"
              :aria-describedby="
                fieldErrors(field.state.meta.errors).length ? priorityErrorId : undefined
              "
              :aria-invalid="
                field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0
              "
              class="select w-full"
              required
              @blur="field.handleBlur"
              @change="
                field.handleChange(($event.target as HTMLSelectElement).value as WantPriority | '');
                updateModel(
                  'priority',
                  ($event.target as HTMLSelectElement).value as WantPriority | '',
                );
              "
            >
              <option value="">Choose a priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <p
            v-if="field.state.meta.isTouched && fieldErrors(field.state.meta.errors).length > 0"
            :id="priorityErrorId"
            class="text-sm text-error"
            role="alert"
          >
            {{ fieldErrors(field.state.meta.errors).join(", ") }}
          </p>
        </div>
      </template>
    </form.Field>

    <form.Field name="targetDate">
      <template #default="{ field }">
        <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
          <span class="label">Target date (optional)</span>
          <input
            :id="`${formId}-${field.name}`"
            :name="field.name"
            type="date"
            :value="field.state.value"
            :disabled="isDisabled"
            class="input w-full"
            @blur="field.handleBlur"
            @input="
              field.handleChange(($event.target as HTMLInputElement).value);
              updateModel('targetDate', ($event.target as HTMLInputElement).value);
            "
          />
        </label>
      </template>
    </form.Field>

    <form.Field name="notes">
      <template #default="{ field }">
        <label class="flex flex-col gap-1" :for="`${formId}-${field.name}`">
          <span class="label">Notes (optional)</span>
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

    <p v-if="error" :id="formErrorId" class="text-sm text-error" role="alert" aria-live="polite">
      {{ error }}
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
          :disabled="isDisabled || !canSubmit || isFormSubmitting"
          :aria-busy="isSubmitting || isFormSubmitting ? 'true' : undefined"
          :aria-describedby="error ? formErrorId : undefined"
        >
          {{ isSubmitting || isFormSubmitting ? "Saving..." : submitLabel || "Save Want" }}
        </button>
      </template>
    </form.Subscribe>
  </form>
</template>
