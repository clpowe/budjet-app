<script setup lang="ts">
const { household, members } = useHousehold();
const { user } = useConvexUser();

const inviteFeedback = shallowRef<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

useHead({
  title: "Household | Daily Funds",
  meta: [
    {
      name: "description",
      content: "Manage the people who share your Daily Funds household.",
    },
  ],
});

const isOwner = computed(() => user.value?.role === "owner");
const inviteCode = computed(() => household.value?.inviteCode ?? "");
const householdName = computed(() => household.value?.name ?? "Your household");

const orderedMembers = computed(() => {
  return [...(members.value ?? [])].sort((left, right) => {
    if (left.role === right.role) {
      return (left.name ?? left.email).localeCompare(right.name ?? right.email);
    }

    return left.role === "owner" ? -1 : 1;
  });
});

const displayName = (member: { name?: string; email: string }) =>
  member.name?.trim() || member.email;

const initials = (member: { name?: string; email: string }) => {
  const label = displayName(member);

  return label
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
};

const showFeedback = (message: string) => {
  inviteFeedback.value = message;

  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
  }

  feedbackTimeout = setTimeout(() => {
    inviteFeedback.value = null;
  }, 3000);
};

const copyInviteCode = async () => {
  if (!inviteCode.value) return;

  try {
    await navigator.clipboard.writeText(inviteCode.value);
    showFeedback("Invite code copied.");
  } catch {
    showFeedback("Couldn’t copy the code. Select it and copy it manually.");
  }
};

const shareInvite = async () => {
  if (!inviteCode.value) return;

  const message = `Join ${householdName.value} on Daily Funds with invite code ${inviteCode.value}.`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Join ${householdName.value} on Daily Funds`,
        text: message,
      });
      showFeedback("Invite shared.");
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  await copyInviteCode();
};
</script>

<template>
  <main class="container mx-auto max-w-5xl px-4 py-5 sm:py-8">
    <section aria-labelledby="household-heading">
      <p class="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Shared plan</p>

      <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            id="household-heading"
            class="text-3xl font-black tracking-tight text-base-content sm:text-4xl"
          >
            {{ householdName }}
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-base-content/65">
            The people here see the same budget, spending, and goals.
          </p>
        </div>

        <p class="rounded-full bg-base-200 px-3 py-1.5 text-sm font-semibold text-base-content/70">
          {{ orderedMembers.length }} {{ orderedMembers.length === 1 ? "person" : "people" }}
        </p>
      </div>
    </section>

    <section
      class="mt-8 grid overflow-hidden rounded-sm border border-base-300 bg-base-100 shadow-sm lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]"
      aria-labelledby="invite-heading"
    >
      <div class="p-5 sm:p-7">
        <p class="text-sm font-semibold text-primary">Invite someone</p>
        <h2 id="invite-heading" class="mt-2 text-2xl font-bold tracking-tight text-base-content">
          Bring another person into the plan
        </h2>
        <p class="mt-3 max-w-lg text-sm leading-6 text-base-content/65">
          They’ll create an account, choose
          <strong class="font-semibold text-base-content">Join existing</strong>, and enter this
          code during setup.
        </p>

        <template v-if="isOwner && inviteCode">
          <div
            class="mt-7 max-w-md border-y-2 border-dashed border-primary/30 bg-primary/5 px-4 py-5 sm:px-5"
          >
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-base-content/55">
              Your household code
            </p>
            <output
              class="mt-2 block font-mono text-3xl font-black tracking-[0.28em] text-primary sm:text-4xl"
            >
              {{ inviteCode }}
            </output>
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              class="btn btn-primary min-h-11 gap-2 px-5"
              @click="copyInviteCode"
            >
              <Icon name="i-heroicons-clipboard-document" class="size-5" />
              Copy code
            </button>

            <button type="button" class="btn btn-ghost min-h-11 gap-2 px-4" @click="shareInvite">
              <Icon name="i-heroicons-share" class="size-5" />
              Share invite
            </button>
          </div>

          <p
            v-if="inviteFeedback"
            class="mt-4 text-sm font-medium text-success"
            role="status"
            aria-live="polite"
          >
            {{ inviteFeedback }}
          </p>
        </template>

        <div
          v-else-if="!isOwner"
          class="mt-7 border-l-2 border-base-300 pl-4 text-sm leading-6 text-base-content/65"
        >
          Only the household owner can share an invite code. Ask them to send you one if someone
          else needs to join.
        </div>

        <div v-else class="mt-7 flex items-center gap-3 text-sm text-base-content/60" role="status">
          <span class="loading loading-spinner loading-sm" aria-hidden="true" />
          Loading your invite code…
        </div>
      </div>

      <aside
        class="border-t border-base-300 bg-base-200/55 p-5 sm:p-7 lg:border-t-0 lg:border-l"
        aria-label="Invite details"
      >
        <div class="grid size-10 place-items-center rounded-full bg-primary text-primary-content">
          <Icon name="i-heroicons-user-plus" class="size-5" />
        </div>
        <h3 class="mt-5 text-base font-bold text-base-content">One code, one shared view</h3>
        <p class="mt-2 text-sm leading-6 text-base-content/65">
          This code stays active for your household. Treat it like a key and only share it with
          people you trust.
        </p>
      </aside>
    </section>

    <section class="mt-8" aria-labelledby="members-heading">
      <div class="flex items-baseline justify-between gap-4 border-b border-base-300 pb-3">
        <div>
          <p class="text-sm font-semibold text-primary">People</p>
          <h2 id="members-heading" class="mt-1 text-xl font-bold tracking-tight text-base-content">
            Household members
          </h2>
        </div>
      </div>

      <div
        v-if="members === undefined"
        class="flex items-center gap-3 py-6 text-sm text-base-content/60"
        role="status"
      >
        <span class="loading loading-spinner loading-sm" aria-hidden="true" />
        Loading members…
      </div>

      <ul v-else class="divide-y divide-base-300" aria-label="Household members">
        <li
          v-for="member in orderedMembers"
          :key="member._id"
          class="flex items-center gap-3 py-4 sm:gap-4"
        >
          <span
            class="grid size-10 shrink-0 place-items-center rounded-full bg-base-200 text-sm font-black text-base-content/75"
            aria-hidden="true"
          >
            {{ initials(member) }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-base-content">{{ displayName(member) }}</p>
            <p v-if="member.name" class="mt-0.5 truncate text-xs text-base-content/60">
              {{ member.email }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="member._id === user?._id"
              class="hidden text-xs font-medium text-base-content/55 sm:inline"
              >You</span
            >
            <span
              class="rounded-full px-2.5 py-1 text-xs font-bold"
              :class="
                member.role === 'owner'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-base-200 text-base-content/65'
              "
            >
              {{ member.role === "owner" ? "Owner" : "Member" }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
