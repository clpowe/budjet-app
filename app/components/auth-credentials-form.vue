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
  <main class="l-center">
    <section class="l-stack" :aria-labelledby="`${mode}-heading`">
      <NuxtLink to="/" aria-label="Daily Funds home"> DF </NuxtLink>

      <header>
        <h1 :id="`${mode}-heading`">
          {{ heading }}
        </h1>

        <p>
          {{ description }}
        </p>
      </header>

      <form class="app-form" novalidate @submit.prevent.stop="form.handleSubmit">
        <form.Field
          v-if="isSignUp"
          name="name"
          :validators="{
            onChange: ({ value }) => (value.trim() ? undefined : 'Enter your name.'),
          }"
        >
          <template #default="{ field }">
            <label :for="field.name">
              <span>Name</span>

              <input
                :id="field.name"
                :name="field.name"
                type="text"
                autocomplete="name"
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
            <label :for="field.name">
              <span>Email</span>

              <input
                :id="field.name"
                :name="field.name"
                type="email"
                inputmode="email"
                autocomplete="email"
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
            <label :for="field.name">
              <span>Password</span>

              <span>
                <input
                  :id="field.name"
                  :name="field.name"
                  :type="showPassword ? 'text' : 'password'"
                  :autocomplete="isSignUp ? 'new-password' : 'current-password'"
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
            >
              {{ field.state.meta.errors.join(", ") }}
            </p>

            <p v-else-if="isSignUp" :id="`${field.name}-help`">Use at least 8 characters.</p>
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
            <button type="submit" :disabled="!canSubmit || isSubmitting || isSessionPending">
              <span v-if="isSubmitting" aria-hidden="true" />

              {{ isSubmitting ? "Please wait…" : primaryLabel }}
            </button>
          </template>
        </form.Subscribe>
      </form>

      <div aria-hidden="true">
        <span />
        <span>or</span>
        <span />
      </div>

      <NuxtLink :to="secondaryRoute">
        {{ secondaryLabel }}
      </NuxtLink>
    </section>
  </main>
</template>
