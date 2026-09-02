<script setup lang="ts">
const { household, members, effectiveTimeZone, updateTimeZone } = useHousehold();
const { user } = useConvexUser();

const inviteFeedback = shallowRef<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

const fallbackTimeZones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
];

const timeZoneOptions = shallowRef(fallbackTimeZones);
const timeZoneFeedback = shallowRef<string | null>(null);
const isUpdatingTimeZone = shallowRef(false);

const selectedTimeZone = computed(() => {
  return household.value?.pendingTimeZone ?? effectiveTimeZone.value;
});

const pendingTimeZoneMessage = computed(() => {
  const pendingTimeZone = household.value?.pendingTimeZone;
  const effectiveAt = household.value?.pendingTimeZoneEffectiveAt;

  if (!pendingTimeZone || effectiveAt === undefined) return null;

  const boundary = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: effectiveTimeZone.value,
  }).format(new Date(effectiveAt));

  return `${pendingTimeZone} takes effect at ${boundary}.`;
});

onMounted(() => {
  if (typeof Intl.supportedValuesOf !== "function") return;

  timeZoneOptions.value = Intl.supportedValuesOf("timeZone");
});

const requestTimeZone = async (event: Event) => {
  const timeZone = (event.target as HTMLSelectElement).value;

  if (!timeZone || timeZone === selectedTimeZone.value || isUpdatingTimeZone.value) return;

  isUpdatingTimeZone.value = true;
  timeZoneFeedback.value = null;

  const result = await updateTimeZone(timeZone);

  isUpdatingTimeZone.value = false;

  if (!result.success) {
    timeZoneFeedback.value = result.error;
    return;
  }

  timeZoneFeedback.value = "Timezone update saved.";
};

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
  <main class="l-page l-stack">
    <section class="l-stack" aria-labelledby="household-heading">
      <p>Shared plan</p>

      <div class="l-cluster l-split">
        <div>
          <h1 id="household-heading">
            {{ householdName }}
          </h1>
          <p>The people here see the same budget, spending, and goals.</p>
        </div>

        <p>{{ orderedMembers.length }} {{ orderedMembers.length === 1 ? "person" : "people" }}</p>
      </div>
    </section>

    <section class="panel l-grid" aria-labelledby="invite-heading">
      <div class="l-stack">
        <p>Invite someone</p>
        <h2 id="invite-heading">Bring another person into the plan</h2>
        <p>
          They’ll create an account, choose
          <strong>Join existing</strong>, and enter this code during setup.
        </p>

        <template v-if="isOwner && inviteCode">
          <div>
            <p>Your household code</p>
            <output>{{ inviteCode }}</output>
          </div>

          <div class="actions">
            <button type="button" @click="copyInviteCode">Copy code</button>

            <button type="button" @click="shareInvite">Share invite</button>
          </div>

          <p v-if="inviteFeedback" role="status" aria-live="polite">
            {{ inviteFeedback }}
          </p>
        </template>

        <div v-else-if="!isOwner">
          Only the household owner can share an invite code. Ask them to send you one if someone
          else needs to join.
        </div>

        <div v-else role="status">
          <span aria-hidden="true" />
          Loading your invite code…
        </div>
      </div>

      <aside class="l-stack" aria-label="Invite details">
        <h3>One code, one shared view</h3>
        <p>
          This code stays active for your household. Treat it like a key and only share it with
          people you trust.
        </p>
      </aside>
    </section>

    <section class="panel l-stack" aria-labelledby="timezone-heading">
      <p>Budget settings</p>
      <h2 id="timezone-heading">Household timezone</h2>
      <p>Spending dates, daily budget windows, and goal progress use this timezone.</p>

      <template v-if="isOwner">
        <label for="household-timezone">
          <span>Timezone</span>
          <select
            id="household-timezone"
            data-test="time-zone-select"
            :value="selectedTimeZone"
            :disabled="isUpdatingTimeZone || !household"
            @change="requestTimeZone"
          >
            <option v-for="timeZone in timeZoneOptions" :key="timeZone" :value="timeZone">
              {{ timeZone }}
            </option>
          </select>
        </label>

        <p v-if="pendingTimeZoneMessage">
          {{ pendingTimeZoneMessage }}
        </p>
        <p v-if="timeZoneFeedback" role="status" aria-live="polite">
          {{ timeZoneFeedback }}
        </p>
      </template>

      <p v-else>Only the household owner can change the budget timezone.</p>
    </section>

    <section class="l-stack" aria-labelledby="members-heading">
      <div>
        <div>
          <p>People</p>
          <h2 id="members-heading">Household members</h2>
        </div>
      </div>

      <div v-if="members === undefined" role="status">
        <span aria-hidden="true" />
        Loading members…
      </div>

      <ul v-else class="l-stack" aria-label="Household members">
        <li v-for="member in orderedMembers" :key="member._id" class="panel l-cluster l-split">
          <div>
            <p>{{ displayName(member) }}</p>
            <p v-if="member.name">
              {{ member.email }}
            </p>
          </div>

          <div>
            <span v-if="member._id === user?._id">You</span>
            <span>
              {{ member.role === "owner" ? "Owner" : "Member" }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
