<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { api } from "@generated/api";

type ReserveSummary = FunctionReturnType<typeof api.reserve.getSummary>;

defineProps<{
  summary: ReserveSummary;
  nextItemName?: string;
}>();
</script>

<template>
  <section aria-label="Goal reserve summary">
    <div>
      <div>
        <h2>Goal reserve</h2>
        <p>Shared money accumulated for the active Wants queue.</p>
      </div>

      <p v-if="nextItemName">Next: {{ nextItemName }}</p>
    </div>

    <dl>
      <div>
        <dt>Available reserve</dt>
        <dd>
          {{ formatCents(summary.availableReserveCents) }}
        </dd>
        <p>Available to fund a Want purchase now.</p>
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
      <h3>Reserve recovery</h3>
      <p>
        {{ formatCents(summary.recoveryAmountCents) }} must be recovered before new progress is
        added.
      </p>
    </div>
  </section>
</template>
