<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { computed } from "vue";
import { api } from "@generated/api";
import { getGoalGuidance } from "../../utils/goal-guidance";

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
  const nextGoal = props.summary.nextGoal;

  if (!nextGoal) return null;

  return getGoalGuidance({
    remainingCents: nextGoal.remainingCents,
    todayLocalDate: props.todayLocalDate,
    targetLocalDate: props.targetLocalDate,
    recentDailyPaceCents: recentDailyPaceCents.value,
    recoveryAmountCents: props.summary.savings.recoveryCents,
    todayOverageAdjustmentCents: props.summary.savings.todayOverageAdjustmentCents,
  });
});

const guidanceCopy = computed(() => {
  const nextGoal = props.summary.nextGoal;
  const currentGuidance = guidance.value;

  if (!nextGoal || !currentGuidance) return "";

  switch (currentGuidance.kind) {
    case "ready":
      return `${nextGoal.name} is fully funded and ready when you are.`;
    case "recovery":
      return `${formatCents(currentGuidance.amountCents)} needs to be recovered before your savings can grow again.`;
    case "negative_today":
      return `Today's spending moved ${formatCents(currentGuidance.amountCents)} out of your savings.`;
    case "target":
      return `Set aside ${formatCents(currentGuidance.dailyCents)} a day to reach your ${formatLocalDate(currentGuidance.targetLocalDate)} target.`;
    case "pace":
      return `At your recent pace of ${formatCents(currentGuidance.dailyCents)} a day, ${nextGoal.name} could be ready around ${formatLocalDate(currentGuidance.readyLocalDate)}.`;
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
  <section aria-labelledby="next-goal-heading">
    <div>
      <div>
        <p>Shared savings</p>
        <h2 id="next-goal-heading">Next goal</h2>
      </div>

      <NuxtLink to="/goals">View goals</NuxtLink>
    </div>

    <template v-if="summary.nextGoal">
      <div>
        <h3>{{ summary.nextGoal.name }}</h3>
        <p>
          {{ formatCents(summary.nextGoal.allocatedCents) }} of
          {{ formatCents(summary.nextGoal.estimatedCostCents) }} funded
        </p>
      </div>

      <progress
        :aria-label="`${summary.nextGoal.name} funding progress`"
        :value="summary.nextGoal.progressBasisPoints"
        max="10000"
      >
        {{ summary.nextGoal.progressBasisPoints / 100 }}%
      </progress>

      <p>{{ formatCents(summary.nextGoal.remainingCents) }} remains to fund this goal.</p>

      <p v-if="guidance">
        <span v-if="guidance.kind === 'recovery'">Savings recovery. </span>
        {{ guidanceCopy }}
      </p>
    </template>

    <p v-else>
      No active goal yet. Move an idea into Plan for it when your household is ready to fund it.
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
