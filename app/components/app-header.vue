<script setup lang="ts">
const { user, signOut } = useBudgetAuth();

const accountPopover = shallowRef<HTMLDivElement | null>(null);
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

    accountPopover.value?.hidePopover();

    await navigateTo("/", {
      replace: true,
    });
  } finally {
    isSigningOut.value = false;
  }
};
function openDialog(dialog: HTMLDialogElement | null) {
  dialog?.showModal();
}

const transactionDialog = shallowRef<HTMLDialogElement | null>(null);
</script>

<template>
  <header class="site-header">
    <div class="">
      <NuxtLink to="/home" aria-label="Daily Funds home">Daily</NuxtLink>

      <nav class="l-stack" aria-label="Primary">
        <NuxtLink to="/home">H</NuxtLink>
        <NuxtLink to="/monthly">M</NuxtLink>
        <NuxtLink to="/goals">W</NuxtLink>
        <NuxtLink to="/household">H</NuxtLink>
      </nav>
      <div class="actions">
        <button type="button" @click="openDialog(transactionDialog)">+</button>
      </div>
      <button
        type="button"
        class="account-trigger"
        popovertarget="accountpopover"
        aria-label="Open account menu"
      >
        U
      </button>
    </div>
    <dialog id="transaction-dialog" ref="transactionDialog">
      <header class="l-cluster l-split">
        <h2>Add transaction</h2>
        <form method="dialog"><button type="submit">Close</button></form>
      </header>
      <expenses-add />
    </dialog>

    <div id="accountpopover" ref="accountPopover" class="l-stack" popover>
      <p>{{ user?.email }}</p>
      <p v-if="signOutError" role="alert" aria-live="polite">{{ signOutError }}</p>
      <button type="button" :disabled="isSigningOut" @click="handleSignOut">
        {{ isSigningOut ? "Signing out…" : "Sign out" }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  grid-area: nav;
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: Canvas;
  border-top: 1px solid black;
  border-right: 0;

  @media (width >= 500px) {
    position: relative;
    bottom: auto;
    border-top: 0;
    border-right: 1px solid black;
  }
}

.site-header {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  width: auto;

  nav {
    display: flex;
  }

  @media (width >= 500px) {
    display: grid;
    width: 5rem;

    nav {
      display: grid;
    }
  }
}

/* Anchor account menu to its trigger; unsupported browsers keep the centered default. */
@supports (anchor-name: --account) {
  .account-trigger {
    anchor-name: --account;
  }

  #accountpopover {
    position-anchor: --account;
    position-area: top span-right;
    position-try-fallbacks: flip-block;
    inset: auto;
    margin: 0.25rem;
  }
}
</style>
