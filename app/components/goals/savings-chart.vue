<script setup lang="ts">
import { crosshair, defineChart, dot, lineY, ruleY } from "@tanstack/charts";
import { focusGroupX } from "@tanstack/charts/focus";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { computed } from "vue";
import { formatLocalDate } from "../../../shared/utils/local-date";
import type { SavingsHistoryPoint } from "../../../shared/utils/savings";

const props = defineProps<{
  /** End-of-day balances for closed days, oldest first. Today is not included. */
  points: readonly SavingsHistoryPoint[];
  availableCents: bigint;
}>();

type Row = { index: number; localDate: string; label: string; balance: number };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDay(localDate: string): string {
  return formatLocalDate(localDate, { month: "short", day: "numeric" });
}

const rows = computed<Row[]>(() =>
  props.points.map((point, index) => ({
    index,
    localDate: point.localDate,
    label: formatDay(point.localDate),
    balance: Number(point.balanceCents) / 100,
  })),
);

const latest = computed(() => props.points.at(-1));

const definition = computed(() => {
  const chartRows = rows.value;
  const balances = chartRows.map((row) => row.balance);
  const low = Math.min(0, ...balances);
  const high = Math.max(0, ...balances);
  const padding = Math.max((high - low) * 0.08, 10);
  const lastIndex = Math.max(chartRows.length - 1, 1);
  const tickIndexes = [...new Set([0, Math.floor(lastIndex / 2), lastIndex])].filter(
    (index) => index < chartRows.length,
  );

  return defineChart(
    {
      marks: [
        decorative(
          ruleY([0], {
            id: "savings-zero-line",
            stroke: "currentColor",
            strokeOpacity: 0.5,
            strokeWidth: 1,
          }),
        ),
        decorative(
          lineY(chartRows, {
            id: "savings-balance",
            x: "index",
            y: "balance",
            key: "localDate",
            stroke: "currentColor",
            strokeWidth: 2.5,
          }),
        ),
        dot(chartRows, {
          id: "savings-balance-points",
          x: "index",
          y: "balance",
          key: "localDate",
          r: 3,
          fill: "currentColor",
          fillOpacity: 0,
          stroke: "currentColor",
          strokeOpacity: 0,
          strokeWidth: 2,
          states: [{ when: { focus: "group" }, style: { fillOpacity: 1, strokeOpacity: 1, r: 5 } }],
        }),
        crosshair<number, number>({
          id: "savings-balance-crosshair",
          x: {
            stroke: "currentColor",
            strokeOpacity: 0.45,
            strokeWidth: 1,
            strokeDasharray: "3 4",
          },
          y: false,
        }),
      ],
      x: {
        scale: scaleLinear().domain([0, lastIndex]),
        axis: {
          line: false,
          ticks: {
            values: tickIndexes,
            size: 0,
            padding: 8,
            format: (index) => chartRows[index]?.label ?? "",
          },
          tickLabels: { fontSize: 10, opacity: 0.62 },
        },
      },
      y: {
        scale: scaleLinear().domain([low - padding, high + padding]),
        grid: true,
        axis: {
          line: false,
          ticks: { count: 4, size: 0, padding: 8, format: (value) => money.format(value) },
          tickLabels: { fontSize: 10, opacity: 0.62 },
        },
      },
      theme: {
        foreground: "currentColor",
        muted: "currentColor",
        grid: "currentColor",
        palette: ["currentColor"],
      },
      focus: focusGroupX,
      focusRing: false,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      keyboard: true,
      clip: true,
      margin: { top: 12, right: 18, bottom: 28, left: 58 },
    },
    {
      tooltip: {
        use: tooltip,
        anchor: "point",
        placement: ["top", "right", "left"],
        offset: 10,
        format: ({ datum }) => `${datum.label} · ${money.format(datum.balance)}`,
      },
    },
  );
});
</script>

<template>
  <section class="panel l-stack" aria-labelledby="savings-chart-heading">
    <header class="l-cluster l-split">
      <div>
        <h2 id="savings-chart-heading">Savings balance at day end</h2>
        <p>Each point is the balance once that day closed. Below the line is a shortfall.</p>
      </div>

      <dl>
        <div>
          <dt>Available now</dt>
          <dd>{{ formatCents(availableCents) }}</dd>
        </div>
      </dl>
    </header>

    <p v-if="points.length === 0" data-test="savings-chart-empty">
      Your savings history appears after the first full day of saving.
    </p>

    <template v-else>
      <p data-test="savings-chart-latest">
        {{ formatDay(latest!.localDate) }}: {{ formatCents(latest!.balanceCents) }}
      </p>

      <div class="chart">
        <Chart
          :definition="definition"
          :height="240"
          :initial-width="720"
          aria-label="Savings balance at the end of each day, with a line at zero"
          aria-description="Use the arrow keys to inspect the balance by day."
        />
      </div>
    </template>
  </section>
</template>
