<script setup lang="ts"></script>

<template>
  <header
    class="flex min-h-16 items-center justify-between gap-4 border-b border-base-300 bg-base-100 px-4 sm:px-6"
  >
    <div class="flex min-w-0 items-center gap-3 sm:gap-5">
      <NuxtLink
        to="/home"
        class="inline-flex min-h-10 items-center gap-2 rounded-sm px-1 font-bold text-base-content"
        aria-label="Daily Funds home"
      >
        <span
          class="grid size-8 place-items-center rounded-sm bg-primary text-sm font-black text-primary-content"
          aria-hidden="true"
        >
          DF
        </span>
        <span class="hidden sm:inline">Daily Funds</span>
      </NuxtLink>

      <nav
        class="flex items-center gap-1 text-sm font-semibold text-base-content/70"
        aria-label="Primary"
      >
        <NuxtLink
          to="/home"
          class="btn btn-ghost btn-sm"
          exact-active-class="bg-base-200 font-bold text-base-content"
        >
          Home
        </NuxtLink>
        <NuxtLink
          to="/monthly"
          class="btn btn-ghost btn-sm"
          exact-active-class="bg-base-200 font-bold text-base-content"
        >
          Monthly
        </NuxtLink>
      </nav>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <ClientOnly>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </ClientOnly>
      <input
        type="checkbox"
        value="light"
        class="toggle theme-controller"
        aria-label="Toggle light theme"
      />
    </div>
  </header>
</template>
