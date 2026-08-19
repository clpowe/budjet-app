<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { computed } from "vue";
import { api } from "@generated/api";
import { getWantGuidance } from "../../utils/want-guidance";

type HomeSummary = FunctionReturnType<typeof api.budget.getHomeSummary>;

const props = defineProps<{
  summary: HomeSummary;
  todayLocalDate: string;
  targetLocalDate?: string;
}>();

const recentDailyPaceCents = computed(() => {
  if (props.summary.elapsedDays <= 0) return 0n;

  return props.summary.currentPlanSetAsideCents / BigInt(props.summary.elapsedDays);
});

const guidance = computed(() => {
  const topItem = props.summary.topItem;

  if (!topItem) return null;

  return getWantGuidance({
    remainingCents: topItem.remainingCents,
    todayLocalDate: props.todayLocalDate,
    targetLocalDate: props.targetLocalDate,
    recentDailyPaceCents: recentDailyPaceCents.value,
    recoveryAmountCents: props.summary.recoveryAmountCents,
    liveNegativeAdjustmentCents: props.summary.liveNegativeAdjustmentCents,
  });
});

const guidanceCopy = computed(() => {
  const topItem = props.summary.topItem;
  const currentGuidance = guidance.value;

  if (!topItem || !currentGuidance) return "";

  switch (currentGuidance.kind) {
    case "ready":
      return `${topItem.name} is fully funded and ready when you are.`;
    case "recovery":
      return `${formatCents(currentGuidance.amountCents)} needs to be recovered before the reserve can grow again.`;
    case "negative_today":
      return `Today's spending moved ${formatCents(currentGuidance.amountCents)} out of current reserve progress.`;
    case "target":
      return `Set aside ${formatCents(currentGuidance.dailyCents)} a day to reach your ${formatLocalDate(currentGuidance.targetLocalDate)} target.`;
    case "pace":
      return `At your recent pace of ${formatCents(currentGuidance.dailyCents)} a day, ${topItem.name} could be ready around ${formatLocalDate(currentGuidance.readyLocalDate)}.`;
    case "starter":
      return "Keep an eye on your next few closes; an estimate will appear after positive progress is recorded.";
  }
});

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T12:00:00.000Z`));
}
</script>

<template>
  <section
    aria-labelledby="top-want-heading"
    class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-semibold uppercase text-base-content/60">Shared goal reserve</p>
        <h2 id="top-want-heading" class="mt-1 text-2xl font-black">Top Want</h2>
      </div>

      <NuxtLink to="/wants" class="btn btn-ghost btn-sm">View Wants</NuxtLink>
    </div>

    <template v-if="summary.topItem">
      <div class="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-xl font-bold">{{ summary.topItem.name }}</h3>
        <p class="text-sm font-semibold text-base-content/70">
          {{ formatCents(summary.topItem.allocatedCents) }} of
          {{ formatCents(summary.topItem.estimatedCostCents) }} funded
        </p>
      </div>

      <progress
        class="progress progress-primary mt-3 w-full"
        :aria-label="`${summary.topItem.name} funding progress`"
        :value="summary.topItem.progressBasisPoints"
        max="10000"
      >
        {{ summary.topItem.progressBasisPoints / 100 }}%
      </progress>

      <p class="mt-2 text-sm text-base-content/65">
        {{ formatCents(summary.topItem.remainingCents) }} remains to fund this Want.
      </p>

      <p
        v-if="guidance"
        class="mt-4 rounded-lg bg-base-200 p-3 text-sm text-base-content/80"
        :class="guidance.kind === 'recovery' ? 'border border-warning/40 bg-warning/10' : ''"
      >
        <span v-if="guidance.kind === 'recovery'" class="font-bold">Reserve recovery. </span>
        {{ guidanceCopy }}
      </p>
    </template>

    <p v-else class="mt-5 max-w-xl text-sm text-base-content/70">
      No active Want yet. Move an idea into Plan for it when your household is ready to fund it.
    </p>

    <dl class="mt-5 grid gap-3 border-t border-base-300 pt-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-base-content/60">Available reserve</dt>
        <dd class="mt-1 text-xl font-bold">
          {{ formatCents(summary.availableReserveCents) }}
        </dd>
      </div>

      <div>
        <dt class="text-sm text-base-content/60">Potential tonight</dt>
        <dd class="mt-1 text-xl font-bold">
          {{ formatCents(summary.potentialTonightCents) }}
        </dd>
      </div>
    </dl>
  </section>
</template>
