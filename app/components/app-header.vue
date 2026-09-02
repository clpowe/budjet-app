<script setup lang="ts">
const { user, signOut } = useBudgetAuth();

const accountMenu = shallowRef<HTMLDetailsElement | null>(null);
const isSigningOut = shallowRef(false);
const signOutError = shallowRef<string | null>(null);

const displayName = computed(() => user.value?.name?.trim() || "Account");

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
  <header class="site-header">
    <div class="l-cluster">
      <NuxtLink to="/home" aria-label="Daily Funds home">Daily Funds</NuxtLink>

      <nav class="l-cluster" aria-label="Primary">
        <NuxtLink to="/home">Home</NuxtLink>
        <NuxtLink to="/monthly">Monthly</NuxtLink>
        <NuxtLink to="/household">Household</NuxtLink>
        <NuxtLink to="/wants">Wants</NuxtLink>
      </nav>
    </div>

    <details ref="accountMenu">
      <summary aria-label="Open account menu">{{ displayName }}</summary>
      <div class="l-stack panel">
        <p>{{ user?.email }}</p>
        <p v-if="signOutError" role="alert" aria-live="polite">{{ signOutError }}</p>
        <button type="button" :disabled="isSigningOut" @click="handleSignOut">
          {{ isSigningOut ? "Signing out…" : "Sign out" }}
        </button>
      </div>
    </details>
  </header>
</template>
