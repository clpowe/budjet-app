<script setup lang="ts">
import { useForm } from "@tanstack/vue-form";

type AuthMode = "sign-in" | "sign-up";

const props = defineProps<{
  mode: AuthMode;
}>();

const route = useRoute();
const { isPending: isSessionPending, signIn, signUp } = useBudgetAuth();

const authGate = useAuthGate();

const showPassword = shallowRef(false);
const submitError = shallowRef<string | null>(null);

const isSignUp = computed(() => props.mode === "sign-up");

const heading = computed(() => (isSignUp.value ? "Create your account" : "Welcome Back"));

const description = computed(() => {
  return isSignUp.value
    ? "Start organizing your household budget."
    : "Sign in to continue to Daily Funds.";
});

const primaryLabel = computed(() => (isSignUp.value ? "Create account" : "Sign in"));

const secondaryLabel = computed(() =>
  isSignUp.value ? "Already have an account? Sign in" : "New to Daily Funds? Create an account",
);

const secondaryRoute = computed(() => (isSignUp.value ? "/auth/sign-in" : "/auth/sign-up"));

const destination = computed(() => {
  if (authGate.status.value === "needs-onboarding") {
    return "/onboarding";
  }

  return getSafeAuthRedirect(route.query.redirect) ?? "/home";
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = useForm({
  defaultValues: {
    name: "",
    email: "",
    password: "",
  },
  onSubmit: async ({ value }) => {
    submitError.value = null;

    const email = value.email.trim().toLocaleLowerCase();

    const authenticate = isSignUp.value
      ? () => signUp({ name: value.name.trim(), email, password: value.password })
      : () => signIn({ email, password: value.password });

    const result = await authenticate();

    if (!result.success) {
      submitError.value = result.error;
      return;
    }

    await navigateTo(destination.value, {
      replace: true,
    });
  },
});
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-base-100 px-5 py-10">
    <section class="w-full max-w-sm" :aria-labelledby="`${mode}-heading`">
      <NuxtLink
        to="/"
        class="mx-auto grid size-16 place-items-center rounded-full bg-primary text-xl font-black tracking-tight text-primary-content shadow-sm"
        aria-label="Daily Funds home"
      >
        DF
      </NuxtLink>

      <header class="mt-8 text-center">
        <h1 :id="`${mode}-heading`" class="text-3xl font-bold tracking-tight text-base-content">
          {{ heading }}
        </h1>

        <p class="mt-3 text-sm leading-6 text-base-content/65">
          {{ description }}
        </p>
      </header>

      <form class="mt-8 space-y-4" novalidate @submit.prevent.stop="form.handleSubmit">
        <form.Field
          v-if="isSignUp"
          name="name"
          :validators="{
            onChange: ({ value }) => (value.trim() ? undefined : 'Enter your name.'),
          }"
        >
          <template #default="{ field }">
            <label class="block" :for="field.name">
              <span class="mb-2 block text-sm font-semibold text-base-content">Name</span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                autocomplete="name"
                class="input input-bordered h-12 w-full rounded-lg bg-base-100"
                :value="field.state.value"
                :aria-invalid="!field.state.meta.isValid"
                :aria-describedby="
                  field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined
                "
                :disabled="isSessionPending"
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
          </template>
        </form.Field>

        <form.Field
          name="email"
          :validators="{
            onChange: ({ value }) => {
              const email = value.trim();

              if (!email) return 'Enter your email address.';
              if (!emailPattern.test(email)) return 'Enter a valid email address.';

              return undefined;
            },
          }"
        >
          <template #default="{ field }">
            <label class="block" :for="field.name">
              <span class="mb-2 block text-sm font-semibold text-base-content">Email</span>

              <input
                :id="field.name"
                :name="field.name"
                type="email"
                inputmode="email"
                autocomplete="email"
                class="input input-bordered h-12 w-full rounded-lg bg-base-100"
                :value="field.state.value"
                :aria-invalid="!field.state.meta.isValid"
                :aria-describedby="
                  field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined
                "
                :disabled="isSessionPending"
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
          </template>
        </form.Field>

        <form.Field
          name="password"
          :validators="{
            onChange: ({ value }) =>
              value.length >= 8 ? undefined : 'Password must be at least 8 characters.',
          }"
        >
          <template #default="{ field }">
            <label class="block" :for="field.name">
              <span class="mb-2 block text-sm font-semibold text-base-content">Password</span>

              <span class="relative block">
                <input
                  :id="field.name"
                  :name="field.name"
                  :type="showPassword ? 'text' : 'password'"
                  :autocomplete="isSignUp ? 'new-password' : 'current-password'"
                  class="input input-bordered h-12 w-full rounded-lg bg-base-100 pr-20"
                  :value="field.state.value"
                  :aria-invalid="!field.state.meta.isValid"
                  :aria-describedby="
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : isSignUp
                        ? `${field.name}-help`
                        : undefined
                  "
                  :disabled="isSessionPending"
                  @blur="field.handleBlur"
                  @input="field.handleChange(($event.target as HTMLInputElement).value)"
                />

                <button
                  type="button"
                  class="absolute inset-y-0 right-3 my-auto h-fit rounded-sm px-2 py-1 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  :disabled="isSessionPending"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? "Hide" : "Show" }}
                </button>
              </span>
            </label>

            <p
              v-if="field.state.meta.isTouched && field.state.meta.errors.length > 0"
              :id="`${field.name}-error`"
              role="alert"
              class="mt-2 text-sm text-error"
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p
              v-else-if="isSignUp"
              :id="`${field.name}-help`"
              class="mt-2 text-xs text-base-content/60"
            >
              Use at least 8 characters.
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
              :disabled="!canSubmit || isSubmitting || isSessionPending"
            >
              <span
                v-if="isSubmitting"
                class="loading loading-spinner loading-sm"
                aria-hidden="true"
              />

              {{ isSubmitting ? "Please wait…" : primaryLabel }}
            </button>
          </template>
        </form.Subscribe>
      </form>

      <div class="my-6 flex items-center gap-4" aria-hidden="true">
        <span class="h-px flex-1 bg-base-300" />
        <span class="text-xs font-semibold uppercase tracking-widest text-base-content/45">or</span>
        <span class="h-px flex-1 bg-base-300" />
      </div>

      <NuxtLink
        :to="secondaryRoute"
        class="btn btn-outline min-h-12 w-full rounded-full border-base-300 bg-base-100 text-base-content"
      >
        {{ secondaryLabel }}
      </NuxtLink>
    </section>
  </main>
</template>
