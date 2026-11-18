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
  return (
    props.summary.plan.closedPositiveSavingsContributionCents /
    BigInt(props.summary.period.elapsedDays)
  );
});

const guidance = computed(() => {
  const nextPlannedWant = props.summary.nextPlannedWant;

  if (!nextPlannedWant) return null;

  return getWantGuidance({
    remainingCents: nextPlannedWant.remainingCents,
    todayLocalDate: props.todayLocalDate,
    targetLocalDate: props.targetLocalDate,
    recentDailyPaceCents: recentDailyPaceCents.value,
    recoveryAmountCents: props.summary.savings.recoveryCents,
    todayOverageAdjustmentCents: props.summary.savings.todayOverageAdjustmentCents,
  });
});

const guidanceCopy = computed(() => {
  const nextPlannedWant = props.summary.nextPlannedWant;
  const currentGuidance = guidance.value;

  if (!nextPlannedWant || !currentGuidance) return "";

  switch (currentGuidance.kind) {
    case "ready":
      return `${nextPlannedWant.name} is fully funded and ready when you are.`;
    case "recovery":
      return `${formatCents(currentGuidance.amountCents)} needs to be recovered before your savings can grow again.`;
    case "negative_today":
      return `Today's spending moved ${formatCents(currentGuidance.amountCents)} out of your savings.`;
    case "target":
      return `Set aside ${formatCents(currentGuidance.dailyCents)} a day to reach your ${formatLocalDate(currentGuidance.targetLocalDate)} target.`;
    case "pace":
      return `At your recent pace of ${formatCents(currentGuidance.dailyCents)} a day, ${nextPlannedWant.name} could be ready around ${formatLocalDate(currentGuidance.readyLocalDate)}.`;
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
  <section aria-labelledby="next-planned-want-heading">
    <div>
      <div>
        <p>Shared savings</p>
        <h2 id="next-planned-want-heading">Next planned Want</h2>
      </div>

      <NuxtLink to="/wants">View Wants</NuxtLink>
    </div>

    <template v-if="summary.nextPlannedWant">
      <div>
        <h3>{{ summary.nextPlannedWant.name }}</h3>
        <p>
          {{ formatCents(summary.nextPlannedWant.allocatedCents) }} of
          {{ formatCents(summary.nextPlannedWant.estimatedCostCents) }} funded
        </p>
      </div>

      <progress
        :aria-label="`${summary.nextPlannedWant.name} funding progress`"
        :value="summary.nextPlannedWant.progressBasisPoints"
        max="10000"
      >
        {{ summary.nextPlannedWant.progressBasisPoints / 100 }}%
      </progress>

      <p>{{ formatCents(summary.nextPlannedWant.remainingCents) }} remains to fund this Want.</p>

      <p v-if="guidance">
        <span v-if="guidance.kind === 'recovery'">Savings recovery. </span>
        {{ guidanceCopy }}
      </p>
    </template>

    <p v-else>
      No active Want yet. Move an idea into Plan for it when your household is ready to fund it.
    </p>

    <dl>
      <div>
        <dt>Savings</dt>
        <dd>
          {{ formatCents(summary.savings.availableCents) }}
        </dd>
      </div>

      <div>
        <dt>Potential tonight</dt>
        <dd>
          {{ formatCents(summary.savings.projectedEndOfDayContributionCents) }}
        </dd>
      </div>
    </dl>
  </section>
</template>
