<script setup lang="ts">
useHead({
  title: "Sign in | Daily Funds",
  meta: [
    {
      name: "description",
      content: "Sign in to Daily Funds to manage your household budget.",
    },
  ],
});

const clerkAppearance = {
  variables: {
    borderRadius: "var(--radius-field)",
    colorBackground: "var(--color-base-100)",
    colorInputBackground: "var(--color-base-100)",
    colorInputText: "var(--color-base-content)",
    colorNeutral: "var(--color-base-300)",
    colorPrimary: "var(--color-primary)",
    colorText: "var(--color-base-content)",
    colorTextOnPrimaryBackground: "var(--color-primary-content)",
    colorTextSecondary: "color-mix(in oklch, var(--color-base-content) 70%, transparent)",
    fontFamily: "inherit",
  },
  elements: {
    card: "w-full rounded-sm border border-base-300 bg-base-100 shadow-sm",
    dividerLine: "bg-base-300",
    dividerText: "text-base-content/60",
    footerActionLink: "link link-hover text-primary",
    formButtonPrimary: "btn btn-primary min-h-12 w-full rounded-sm text-base",
    formFieldInput:
      "input input-bordered w-full rounded-sm border-base-300 bg-base-100 text-base-content",
    formFieldLabel: "text-sm font-medium text-base-content",
    headerSubtitle: "text-base-content/70",
    headerTitle: "text-base-content",
    socialButtonsBlockButton:
      "btn btn-outline min-h-12 w-full rounded-sm border-base-300 bg-base-100 text-base-content",
    socialButtonsBlockButtonText: "font-medium",
  },
} as const;
</script>

<template>
  <main
    class="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
  >
    <section
      class="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]"
      aria-labelledby="sign-in-heading"
    >
      <h1 id="sign-in-heading" class="sr-only">Sign in to Daily Funds</h1>

      <div class="hidden min-w-0 space-y-6 lg:block">
        <div
          class="grid size-16 place-items-center rounded-sm bg-primary text-2xl font-black text-primary-content"
          aria-hidden="true"
        >
          DF
        </div>
        <div class="max-w-md space-y-3">
          <p class="text-4xl font-black leading-tight">Daily Funds</p>
          <p class="text-base leading-7 text-base-content/70">
            Sign in to continue managing your household budget.
          </p>
        </div>
      </div>

      <div
        class="w-full min-w-0 max-w-md justify-self-center lg:justify-self-end [&_.cl-card]:max-w-full [&_.cl-rootBox]:w-full"
      >
        <SignIn afterSignInUrl="/home" afterSignUpUrl="/home" :appearance="clerkAppearance" />
      </div>
    </section>
  </main>
</template>
