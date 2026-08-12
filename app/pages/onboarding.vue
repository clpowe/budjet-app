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
  <main class="flex min-h-dvh items-center justify-center bg-base-100 px-5 py-10">
    <section class="w-full max-w-sm" aria-labelledby="onboarding-heading">
      <div
        class="mx-auto grid size-16 place-items-center rounded-full bg-primary text-xl font-black tracking-tight text-primary-content shadow-sm"
        aria-hidden="true"
      >
        DF
      </div>

      <header class="mt-8 text-center">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-primary">One last step</p>

        <h1
          id="onboarding-heading"
          class="mt-3 text-3xl font-bold tracking-tight text-base-content"
        >
          Set up your household
        </h1>

        <p class="mt-3 text-sm leading-6 text-base-content/65">
          A household keeps everyone’s budget, expenses, and goals together.
        </p>
      </header>

      <div
        class="mt-8 grid grid-cols-2 gap-2 rounded-xl bg-base-200 p-1.5"
        role="group"
        aria-label="Household setup method"
      >
        <button
          type="button"
          class="min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="
            mode === 'create'
              ? 'bg-base-100 text-base-content shadow-sm'
              : 'text-base-content/60 hover:text-base-content'
          "
          :aria-pressed="mode === 'create'"
          @click="selectMode('create')"
        >
          Create new
        </button>

        <button
          type="button"
          class="min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="
            mode === 'join'
              ? 'bg-base-100 text-base-content shadow-sm'
              : 'text-base-content/60 hover:text-base-content'
          "
          :aria-pressed="mode === 'join'"
          @click="selectMode('join')"
        >
          Join existing
        </button>
      </div>

      <form class="mt-6 space-y-4" novalidate @submit.prevent.stop="form.handleSubmit">
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
            <label class="block" :for="field.name">
              <span class="mb-2 block text-sm font-semibold text-base-content">
                Household name
              </span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                autocomplete="organization"
                maxlength="60"
                placeholder="Rivera family"
                class="input input-bordered h-12 w-full rounded-lg bg-base-100"
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
              class="mt-2 text-sm text-error"
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p v-else :id="`${field.name}-help`" class="mt-2 text-xs text-base-content/60">
              You can change this later.
            </p>
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
            <label class="block" :for="field.name">
              <span class="mb-2 block text-sm font-semibold text-base-content"> Invite code </span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                maxlength="6"
                placeholder="ABC123"
                class="input input-bordered h-12 w-full rounded-lg bg-base-100 font-mono text-lg uppercase tracking-[0.2em]"
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
              class="mt-2 text-sm text-error"
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p v-else :id="`${field.name}-help`" class="mt-2 text-xs text-base-content/60">
              Ask a household member to share their code.
            </p>
          </template>
        </form.Field>

        <p
          v-if="submitError"
          role="alert"
          aria-live="polite"
          class="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
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
            <button
              type="submit"
              class="btn btn-primary min-h-12 w-full rounded-full text-base font-bold"
              :disabled="!canSubmit || isSubmitting"
            >
              <span
                v-if="isSubmitting"
                class="loading loading-spinner loading-sm"
                aria-hidden="true"
              />

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
