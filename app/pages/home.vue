<script setup lang="ts">
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/utils/money-cents";

const { displayDate, currentMonth, currentDate, setDate } = useDate();

setDate(new Date());

const { data: summary } = useConvexQuery(
  api.budget.getHomeSummary,
  computed(() => ({ asOfTimestamp: currentDate.value.getTime() })),
);

const isDesktop = useMediaQuery("(width >= 1000px)");
const chatPopover = shallowRef<HTMLElement | null>(null);
const householdChat = shallowRef<{ scrollToBottom: () => void } | null>(null);

watch(isDesktop, (desktop) => {
  if (desktop && chatPopover.value?.matches(":popover-open")) {
    chatPopover.value.hidePopover();
  }
});

useEventListener(chatPopover, "toggle", (event: ToggleEvent) => {
  if (event.newState === "open") {
    householdChat.value?.scrollToBottom();
  }
});

// Keep the existing details tabs in sync with the child route.
type HeaderTab = "today" | "month";
const route = useRoute();
const activeTab = computed<HeaderTab>({
  get: () => (route.path.replace(/\/$/, "").endsWith("/month") ? "month" : "today"),
  set: (tab) => {
    void navigateTo(`/home/${tab}`);
  },
});

// Browser-initiated opens (e.g. find-in-page) bypass the summary click; keep state in sync.
function syncActiveTab(tab: HeaderTab, event: Event) {
  if ((event.target as HTMLDetailsElement).open && activeTab.value !== tab) {
    activeTab.value = tab;
  }
}

definePageMeta({
  middleware: (to) => {
    if (to.path === "/home" || to.path === "/home/") {
      return navigateTo("/home/today", { replace: true });
    }
  },
});
</script>

<template>
  <div class="home">
    <div class="page-info">
      <p>{{ displayDate }}</p>
      <h1>Home</h1>
    </div>
    <div class="controls">
      <div>Toggle <button popovertarget="chatpopover">chat</button></div>
    </div>
    <div class="main-section">
      <div>
        <div id="tabs" class="tabs">
          <details
            name="header-tabs"
            :open="activeTab === 'today'"
            @toggle="syncActiveTab('today', $event)"
          >
            <summary @click.prevent="activeTab = 'today'">Today</summary>
            <div v-if="summary">
              {{
                formatCents(summary.plan.dailyAllowanceCents - summary.spending.today.expenseCents)
              }}
              <div>
                Available to Spend
                <div>
                  {{ formatCents(summary.spending.today.budgetImpactCents) }}
                  spent today
                </div>

                <div>
                  {{ formatCents(summary.savings.projectedEndOfDayContributionCents) }}
                  spent today
                </div>
              </div>
            </div>
            <p v-else role="status">Loading budget…</p>
          </details>

          <details
            name="header-tabs"
            :open="activeTab === 'month'"
            @toggle="syncActiveTab('month', $event)"
          >
            <summary @click.prevent="activeTab = 'month'">{{ currentMonth }}</summary>
            <div>Content 2</div>
          </details>
        </div>
      </div>
      <div class="content-container">
        <NuxtPage />
      </div>
    </div>
    <div id="chatpopover" ref="chatPopover" class="chat-section" popover>
      <HouseholdChat ref="householdChat">
        <template #header>
          <button
            class="chat-close"
            type="button"
            popovertarget="chatpopover"
            popovertargetaction="hide"
          >
            Close
          </button>
        </template>
      </HouseholdChat>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: grid;
  height: 100%;
  grid-template-areas:
    "info"
    "main"
    "controls";
  grid-template-rows: auto 1fr auto;

  @container main-container (width >= 1000px) {
    grid-template-areas:
      "info controls chat"
      "main main chat";
    grid-template-columns: 1fr auto minmax(0, 400px);
    grid-template-rows: auto 1fr;
  }
}
.page-info {
  grid-area: info;
}
.controls {
  grid-area: controls;
}
.main-section {
  grid-area: main;
}
.chat-section {
  grid-area: chat;
  max-width: 400px;
  overflow: hidden;
  padding: 1rem;

  /* Mobile: drawer sliding in from the right. */
  inset: 0 0 0 auto;
  height: 100dvh;
  max-height: none;
  margin: 0;
  translate: 100% 0;
  transition:
    translate 0.25s ease,
    display 0.25s allow-discrete,
    overlay 0.25s allow-discrete;
}
.chat-section:popover-open {
  translate: 0 0;
}
@starting-style {
  .chat-section:popover-open {
    translate: 100% 0;
  }
}
.chat-section::backdrop {
  background: rgb(0 0 0 / 0.4);
}

/* Desktop: plain grid column; beats the global [popover]:not(:popover-open) hide rule. */
@container main-container (width >= 1000px) {
  .chat-section,
  .chat-section:not(:popover-open) {
    display: block;
    position: sticky;
    top: 0;
    align-self: start;
    inset: auto;
    margin: 0;
    translate: none;
    width: auto;
    height: 100dvh;
    max-height: none;
    border: 0;
    transition: none;
  }
  .controls [popovertarget="chatpopover"],
  .chat-close {
    display: none;
  }
}

.tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: auto 1fr;
  column-gap: 1rem;

  details {
    display: grid;
    grid-template-rows: subgrid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    grid-row: 1 / span 2;

    &::details-content {
      grid-row: 2;
      grid-column: 1/ -1;
      padding: 1rem;
    }

    &:not([open])::details-content {
      display: none;
    }
    &:nth-of-type(1) summary {
      grid-column: 1 / span 1;
    }
    /* Second item in second column */
    &:nth-of-type(2) summary {
      grid-column: 2 / span 1;
    }
  }
  summary {
    grid-row: 1; /* First subgrid row */
    display: grid;
    z-index: 1;
    padding: 1rem; /* Some breathing room */
    cursor: pointer; /* Update the cursor when hovered */
  }
}
.content-container {
  container-type: inline-size;
  container-name: content-container;
}
</style>
