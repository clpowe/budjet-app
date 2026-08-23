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
  <section
    aria-label="Goal reserve summary"
    class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold">Goal reserve</h2>
        <p class="mt-1 text-sm text-base-content/65">
          Shared money accumulated for the active Wants queue.
        </p>
      </div>

      <p
        v-if="nextItemName"
        class="rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
      >
        Next: {{ nextItemName }}
      </p>
    </div>

    <dl class="mt-5 grid gap-4 sm:grid-cols-2">
      <div class="border-t border-base-300 pt-3">
        <dt class="text-sm text-base-content/65">Available reserve</dt>
        <dd class="mt-1 text-2xl font-black">
          {{ formatCents(summary.availableReserveCents) }}
        </dd>
        <p class="mt-1 text-xs text-base-content/60">Available to fund a Want purchase now.</p>
      </div>

      <div class="border-t border-base-300 pt-3">
        <dt class="text-sm text-base-content/65">Potential tonight</dt>
        <dd class="mt-1 text-2xl font-black">
          {{ formatCents(summary.projectedEndOfDayContributionCents) }}
        </dd>
        <p class="mt-1 text-xs text-base-content/60">An estimate until today closes.</p>
      </div>
    </dl>

    <div
      v-if="summary.recoveryAmountCents > 0n"
      class="mt-5 rounded-lg border border-warning/40 bg-warning/10 p-4"
    >
      <h3 class="font-bold">Reserve recovery</h3>
      <p class="mt-1 text-sm">
        {{ formatCents(summary.recoveryAmountCents) }} must be recovered before new progress is
        added.
      </p>
    </div>
  </section>
</template>
