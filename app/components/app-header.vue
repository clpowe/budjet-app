<script setup lang="ts">
const { user, signOut } = useBudgetAuth();

const accountMenu = shallowRef<HTMLDetailsElement | null>(null);
const isSigningOut = shallowRef(false);
const signOutError = shallowRef<string | null>(null);

const displayName = computed(() => user.value?.name?.trim() || "Account");

const initials = computed(() => {
  const name = user.value?.name?.trim();

  if (name) {
    return name
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  return user.value?.email?.slice(0, 2).toUpperCase() ?? "DF";
});

const handleSignOut = async () => {
  if (isSigningOut.value) {
    return;
  }

  isSigningOut.value = true;
  signOutError.value = null;

  try {
    const result = await signOut();

    if (!result.success) {
      signOutError.value = result.error;
      return;
    }

    accountMenu.value?.removeAttribute("open");

    await navigateTo("/", {
      replace: true,
    });
  } finally {
    isSigningOut.value = false;
  }
};
</script>

<template>
  <header
    class="flex min-h-16 items-center justify-between gap-4 border-b border-base-300 bg-base-100 px-4 sm:px-6"
  >
    <div class="flex min-w-0 items-center gap-3 sm:gap-5">
      <NuxtLink
        to="/home"
        class="inline-flex min-h-10 items-center gap-2 rounded-sm px-1 font-bold text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

    <div class="flex shrink-0 items-center gap-2">
      <details ref="accountMenu" class="dropdown dropdown-end">
        <summary
          class="btn btn-ghost min-h-10 list-none gap-2 rounded-full px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Open account menu"
        >
          <span
            class="grid size-8 place-items-center rounded-full bg-primary text-xs font-black tracking-wide text-primary-content"
            aria-hidden="true"
          >
            {{ initials }}
          </span>

          <span class="hidden max-w-32 truncate text-sm font-semibold sm:block">
            {{ displayName }}
          </span>

          <span class="text-xs text-base-content/50" aria-hidden="true">▾</span>
        </summary>

        <div
          class="dropdown-content z-50 mt-2 w-72 rounded-xl border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <div class="px-3 py-2">
            <p class="truncate text-sm font-bold text-base-content">
              {{ displayName }}
            </p>

            <p class="mt-1 truncate text-xs text-base-content/60">
              {{ user?.email }}
            </p>
          </div>

          <div class="my-1 h-px bg-base-300" />

          <p
            v-if="signOutError"
            role="alert"
            aria-live="polite"
            class="mx-2 mb-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error"
          >
            {{ signOutError }}
          </p>

          <button
            type="button"
            class="btn btn-ghost min-h-10 w-full justify-start rounded-lg px-3 text-sm font-semibold text-error"
            :disabled="isSigningOut"
            @click="handleSignOut"
          >
            <span
              v-if="isSigningOut"
              class="loading loading-spinner loading-xs"
              aria-hidden="true"
            />

            {{ isSigningOut ? "Signing out…" : "Sign out" }}
          </button>
        </div>
      </details>

      <input
        type="checkbox"
        value="light"
        class="toggle theme-controller"
        aria-label="Toggle light theme"
      />
    </div>
  </header>
</template>
