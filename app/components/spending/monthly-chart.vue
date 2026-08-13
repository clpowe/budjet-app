<script setup lang="ts">
import { areaY, crosshair, defineChart, dot, lineY } from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { focusGroupX } from "@tanstack/charts/focus";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/vue";
import { monthStart } from "@formkit/tempo";
import { curveMonotoneX } from "d3-shape";
import { api } from "../../../convex/_generated/api";
import {
  buildMonthlySpendingRows,
  buildPreviousMonthSpendingRows,
} from "../../utils/monthly-spending";

const { currentDate, queryMonthBounds } = useDate();
const previousMonthBounds = computed(() => {
  const date = new Date(currentDate.value);
  const currentMonthStart = monthStart(date);
  const previousMonthStart = monthStart(new Date(date.getFullYear(), date.getMonth() - 1, 1));

  return { from: previousMonthStart.getTime(), to: currentMonthStart.getTime() };
});
const { data: household } = useConvexQuery(api.households.getMyHousehold, {});
const dailyBudget = computed(() => {
  const allowance = household.value?.allowance;
  return typeof allowance === "number" && Number.isFinite(allowance) ? allowance : 50;
});

const { data: monthlyExpenses } = useConvexQuery(
  api.expenses.listMyExpenses,
  computed(() => ({
    from: queryMonthBounds.value.from,
    to: queryMonthBounds.value.to,
  })),
);

const { data: previousMonthExpenses } = useConvexQuery(
  api.expenses.listMyExpenses,
  previousMonthBounds,
);

const rows = computed(() =>
  buildMonthlySpendingRows(monthlyExpenses.value ?? [], currentDate.value, dailyBudget.value),
);
const previousRows = computed(() =>
  buildPreviousMonthSpendingRows(previousMonthExpenses.value ?? [], currentDate.value),
);

const currentRow = computed(() => rows.value.findLast((row) => row.spent !== null));
const spentToDate = computed(() => currentRow.value?.spent ?? 0);
const budgetToDate = computed(() => currentRow.value?.budget ?? 0);
const paceDifference = computed(() => budgetToDate.value - spentToDate.value);
const isOnPace = computed(() => paceDifference.value >= 0);

const monthLabel = computed(() =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(currentDate.value),
);

const smooth = d3Curve(curveMonotoneX);
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const definition = computed(() => {
  const chartRows = rows.value;
  const actualRows = chartRows.filter(
    (row): row is typeof row & { spent: number } => row.spent !== null,
  );
  const finalBudget = chartRows.at(-1)?.budget ?? 0;
  const maximumSpend = Math.max(0, ...actualRows.map((row) => row.spent));
  const previousActualRows = previousRows.value.filter(
    (row): row is typeof row & { spent: number } => row.spent !== null,
  );
  const maximumPreviousSpend = Math.max(0, ...previousActualRows.map((row) => row.spent));
  const yMaximum = Math.max(
    100,
    Math.ceil((Math.max(finalBudget, maximumSpend, maximumPreviousSpend) * 1.08) / 100) * 100,
  );
  const lastDay = chartRows.at(-1)?.day ?? 31;

  return defineChart(
    {
      marks: [
        decorative(
          areaY(actualRows, {
            id: "monthly-spending-area",
            x: "day",
            y1: 0,
            y2: "spent",
            key: "id",
            fill: "url(#monthly-spending-fill)",
            fillOpacity: 1,
            curve: smooth,
          }),
        ),
        decorative(
          lineY(chartRows, {
            id: "monthly-budget-pace",
            x: "day",
            y: "budget",
            key: "id",
            stroke: "var(--monthly-chart-budget)",
            strokeWidth: 1.5,
            strokeDasharray: "5 5",
            curve: smooth,
          }),
        ),
        decorative(
          lineY(actualRows, {
            id: "monthly-spending",
            x: "day",
            y: "spent",
            key: "id",
            stroke: "var(--monthly-chart-spend)",
            strokeWidth: 3,
            curve: smooth,
          }),
        ),
        decorative(
          lineY(previousActualRows, {
            id: "monthly-previous-spending",
            x: "day",
            y: "spent",
            key: "id",
            stroke: "var(--monthly-chart-previous)",
            strokeWidth: 2,
            strokeDasharray: "2 5",
            curve: smooth,
          }),
        ),
        dot(actualRows, {
          id: "monthly-spending-points",
          x: "day",
          y: "spent",
          key: "id",
          r: 3,
          fill: "var(--monthly-chart-spend)",
          fillOpacity: 0,
          stroke: "var(--monthly-chart-surface)",
          strokeOpacity: 0,
          strokeWidth: 2,
          states: [
            {
              when: { focus: "group" },
              style: { fillOpacity: 1, strokeOpacity: 1, r: 5 },
            },
          ],
        }),
        crosshair<number, number>({
          id: "monthly-spending-crosshair",
          x: {
            stroke: "var(--monthly-chart-grid)",
            strokeOpacity: 0.45,
            strokeWidth: 1,
            strokeDasharray: "3 4",
          },
          y: false,
        }),
      ],
      x: {
        scale: scaleLinear().domain([1, lastDay]),
        axis: {
          line: false,
          ticks: {
            values: [1, Math.ceil(lastDay / 2), lastDay],
            size: 0,
            padding: 8,
            format: (day) => `${monthLabel.value.slice(0, 3)} ${day}`,
          },
          tickLabels: {
            fontSize: 10,
            opacity: 0.62,
          },
        },
      },
      y: {
        scale: scaleLinear().domain([0, yMaximum]),
        grid: true,
        axis: {
          line: false,
          ticks: { count: 4, size: 0, padding: 8, format: (value) => money.format(value) },
          tickLabels: { fontSize: 10, opacity: 0.62 },
        },
      },
      gradients: [
        {
          id: "monthly-spending-fill",
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          stops: [
            { offset: 0, color: "var(--monthly-chart-spend)", opacity: 0.32 },
            { offset: 0.65, color: "var(--monthly-chart-spend)", opacity: 0.1 },
            { offset: 1, color: "var(--monthly-chart-spend)", opacity: 0.015 },
          ],
        },
      ],
      theme: {
        background: "transparent",
        foreground: "var(--monthly-chart-foreground)",
        muted: "var(--monthly-chart-muted)",
        grid: "var(--monthly-chart-grid)",
        palette: ["var(--monthly-chart-spend)"],
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
        format: ({ datum }) => `${datum.label} · ${money.format(datum.spent ?? 0)} spent`,
      },
    },
  );
});
</script>

<template>
  <section class="monthly-spend-card" aria-labelledby="monthly-spending-heading">
    <header class="monthly-spend-card__header">
      <div>
        <p class="monthly-spend-card__eyebrow">Month to date</p>
        <h2 id="monthly-spending-heading" class="monthly-spend-card__title">
          {{ monthLabel }} spending
        </h2>
        <p class="monthly-spend-card__description">Cumulative household spending against plan</p>
      </div>

      <div class="monthly-spend-card__metric">
        <p class="monthly-spend-card__amount">{{ formatMoney(spentToDate) }}</p>
        <p :class="isOnPace ? 'text-success' : 'text-error'">
          {{ formatMoney(Math.abs(paceDifference)) }} {{ isOnPace ? "under" : "over" }} pace
        </p>
      </div>
    </header>

    <div class="monthly-spend-card__legend" aria-label="Chart legend">
      <span><i class="monthly-spend-card__swatch monthly-spend-card__swatch--spent"></i>Spent</span>
      <span
        ><i class="monthly-spend-card__swatch monthly-spend-card__swatch--budget"></i>Budget
        pace</span
      >
      <span
        ><i class="monthly-spend-card__swatch monthly-spend-card__swatch--previous"></i>Previous
        month</span
      >
    </div>

    <div class="monthly-spend-card__chart">
      <Chart
        :definition="definition"
        :height="300"
        :initial-width="720"
        aria-label="Cumulative spending, previous month spending, and budget pace for the current month"
        aria-description="Use the arrow keys to inspect cumulative spending by day."
      />
    </div>
  </section>
</template>

<style scoped>
.monthly-spend-card {
  --monthly-chart-surface: var(--color-base-100, #fff);
  --monthly-chart-foreground: var(--color-base-content, #17202a);
  --monthly-chart-muted: color-mix(in srgb, var(--monthly-chart-foreground) 58%, transparent);
  --monthly-chart-grid: color-mix(in srgb, var(--monthly-chart-foreground) 16%, transparent);
  --monthly-chart-spend: #0f766e;
  --monthly-chart-previous: #64748b;
  --monthly-chart-budget: #d97706;
  --ts-chart-tooltip-max-width: min(18rem, 82%);
  --ts-chart-tooltip-padding: 8px 10px;
  --ts-chart-tooltip-background: color-mix(in srgb, var(--monthly-chart-surface) 96%, transparent);
  --ts-chart-tooltip-color: var(--monthly-chart-foreground);
  --ts-chart-tooltip-border: 1px solid var(--color-base-300, #d6d9dd);
  --ts-chart-tooltip-border-radius: 6px;
  --ts-chart-tooltip-shadow: 0 10px 28px rgb(15 23 42 / 14%);
  overflow: hidden;
  border: 1px solid var(--color-base-300);
  border-radius: 0.125rem;
  background: var(--color-base-100);
  box-shadow: 0 1px 2px rgb(15 23 42 / 5%);
}

.monthly-spend-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.5rem 1.5rem 0.5rem;
}

.monthly-spend-card__eyebrow {
  color: color-mix(in srgb, var(--monthly-chart-foreground) 54%, transparent);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.monthly-spend-card__title {
  margin-top: 0.25rem;
  font-size: 1.125rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.monthly-spend-card__description {
  margin-top: 0.25rem;
  color: color-mix(in srgb, var(--monthly-chart-foreground) 62%, transparent);
  font-size: 0.8rem;
}

.monthly-spend-card__metric {
  flex: none;
  text-align: right;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.monthly-spend-card__amount {
  color: var(--monthly-chart-foreground);
  font-size: 1.75rem;
  font-weight: 850;
  letter-spacing: -0.04em;
  line-height: 1;
}

.monthly-spend-card__legend {
  display: flex;
  gap: 1.25rem;
  padding: 0.75rem 1.5rem 0;
  color: color-mix(in srgb, var(--monthly-chart-foreground) 62%, transparent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.monthly-spend-card__legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.monthly-spend-card__swatch {
  display: inline-block;
  width: 0.7rem;
  height: 0.2rem;
  background: currentColor;
}

.monthly-spend-card__swatch--spent {
  color: var(--monthly-chart-spend);
}

.monthly-spend-card__swatch--budget {
  color: var(--monthly-chart-budget);
}

.monthly-spend-card__swatch--previous {
  background: repeating-linear-gradient(
    to right,
    currentColor 0,
    currentColor 0.2rem,
    transparent 0.2rem,
    transparent 0.4rem
  );
  color: var(--monthly-chart-previous);
}

.monthly-spend-card__chart {
  min-width: 0;
  padding: 0 0.5rem 0.5rem 0;
}

@media (max-width: 639px) {
  .monthly-spend-card__header {
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1.25rem 0.5rem;
  }

  .monthly-spend-card__metric {
    text-align: left;
  }

  .monthly-spend-card__legend {
    padding-inline: 1.25rem;
  }

  .monthly-spend-card__chart {
    margin-left: -0.75rem;
  }
}
</style>
