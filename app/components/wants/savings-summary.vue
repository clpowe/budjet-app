<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { api } from "@generated/api";

type SavingsSummary = FunctionReturnType<typeof api.savings.getSummary>;

defineProps<{
  summary: SavingsSummary;
  nextItemName?: string;
}>();
</script>

<template>
  <section aria-label="Savings summary">
    <div>
      <div>
        <h2>Savings</h2>
        <p>Money your household has set aside for planned purchases.</p>
      </div>

      <p v-if="nextItemName">Next: {{ nextItemName }}</p>
    </div>

    <dl>
      <div>
        <dt>For planned purchases</dt>
        <dd>
          {{ formatCents(summary.availableSavingsCents) }}
        </dd>
      </div>

      <div>
        <dt>Potential tonight</dt>
        <dd>
          {{ formatCents(summary.projectedEndOfDayContributionCents) }}
        </dd>
        <p>An estimate until today closes.</p>
      </div>
    </dl>

    <div v-if="summary.recoveryAmountCents > 0n">
      <h3>Savings recovery</h3>
      <p>
        {{ formatCents(summary.recoveryAmountCents) }} must be recovered before new progress is
        added.
      </p>
    </div>
  </section>
</template>
