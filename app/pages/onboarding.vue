<script setup lang="ts">
import { useForm } from "@tanstack/vue-form";

type SetupMode = "create" | "join";

definePageMeta({
  layout: "auth",
});

useHead({
  title: "Set up your houshold | Daily Funds",
  meta: [
    {
      name: "description",
      content: "Create a household or join one with an invite code.",
    },
  ],
});

const mode = shallowRef<SetupMode>("create");
const submitError = shallowRef<string | null | undefined>(null);

const { createHousehold, joinHousehold } = useHousehold();

const selectMode = (nextMode: SetupMode) => {
  mode.value = nextMode;
  submitError.value = null;
};
const form = useForm({
  defaultValues: {
    householdName: "",
    inviteCode: "",
  },
  onSubmit: async ({ value }) => {
    submitError.value = null;

    const result =
      mode.value === "create"
        ? await createHousehold(value.householdName.trim())
        : await joinHousehold(value.inviteCode.trim().toUpperCase());

    if (!result.success) {
      submitError.value = result.error;
      return;
    }

    await navigateTo("/home", {
      replace: true,
    });
  },
});
</script>

<template>
  <main class="l-center">
    <section class="l-stack" aria-labelledby="onboarding-heading">
      <div aria-hidden="true">DF</div>

      <header>
        <p>One last step</p>

        <h1 id="onboarding-heading">Set up your household</h1>

        <p>A household keeps everyone’s budget, expenses, and goals together.</p>
      </header>

      <div role="group" aria-label="Household setup method">
        <button type="button" :aria-pressed="mode === 'create'" @click="selectMode('create')">
          Create new
        </button>

        <button type="button" :aria-pressed="mode === 'join'" @click="selectMode('join')">
          Join existing
        </button>
      </div>

      <form class="app-form" novalidate @submit.prevent.stop="form.handleSubmit">
        <form.Field
          v-if="mode === 'create'"
          name="householdName"
          :validators="{
            onChange: ({ value }) => {
              const name = value.trim();

              if (!name) return 'Enter a household name.';
              if (name.length < 2) return 'Use at least 2 characters.';
              if (name.length > 60) return 'Use 60 characters or fewer.';

              return undefined;
            },
          }"
        >
          <template #default="{ field }">
            <label :for="field.name">
              <span> Household name </span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                autocomplete="organization"
                maxlength="60"
                placeholder="Rivera family"
                :value="field.state.value"
                :aria-invalid="!field.state.meta.isValid"
                :aria-describedby="
                  field.state.meta.errors.length > 0 ? `${field.name}-error` : `${field.name}-help`
                "
                @blur="field.handleBlur"
                @input="field.handleChange(($event.target as HTMLInputElement).value)"
              />
            </label>

            <p
              v-if="field.state.meta.isTouched && field.state.meta.errors.length > 0"
              :id="`${field.name}-error`"
              role="alert"
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p v-else :id="`${field.name}-help`">You can change this later.</p>
          </template>
        </form.Field>

        <form.Field
          v-else
          name="inviteCode"
          :validators="{
            onChange: ({ value }) => {
              const code = value.trim();

              if (!code) return 'Enter your invite code.';
              if (code.length !== 6) return 'Invite codes contain 6 characters.';

              return undefined;
            },
          }"
        >
          <template #default="{ field }">
            <label :for="field.name">
              <span> Invite code </span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                maxlength="6"
                placeholder="ABC123"
                :value="field.state.value"
                :aria-invalid="!field.state.meta.isValid"
                :aria-describedby="
                  field.state.meta.errors.length > 0 ? `${field.name}-error` : `${field.name}-help`
                "
                @blur="field.handleBlur"
                @input="field.handleChange(($event.target as HTMLInputElement).value.toUpperCase())"
              />
            </label>

            <p
              v-if="field.state.meta.isTouched && field.state.meta.errors.length > 0"
              :id="`${field.name}-error`"
              role="alert"
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p v-else :id="`${field.name}-help`">Ask a household member to share their code.</p>
          </template>
        </form.Field>

        <p v-if="submitError" role="alert" aria-live="polite">
          {{ submitError }}
        </p>

        <form.Subscribe
          :selector="
            (state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })
          "
        >
          <template #default="{ canSubmit, isSubmitting }">
            <button type="submit" :disabled="!canSubmit || isSubmitting">
              <span v-if="isSubmitting" aria-hidden="true" />

              {{
                isSubmitting ? "Saving…" : mode === "create" ? "Create household" : "Join household"
              }}
            </button>
          </template>
        </form.Subscribe>
      </form>
    </section>
  </main>
</template>
