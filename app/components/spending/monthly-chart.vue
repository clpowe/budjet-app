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
            fill: "currentColor",
            fillOpacity: 0.05,
            curve: smooth,
          }),
        ),
        decorative(
          lineY(chartRows, {
            id: "monthly-budget-pace",
            x: "day",
            y: "budget",
            key: "id",
            stroke: "currentColor",
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
            stroke: "currentColor",
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
            stroke: "currentColor",
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
          fill: "currentColor",
          fillOpacity: 0,
          stroke: "currentColor",
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
            stroke: "currentColor",
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
        format: ({ datum }) => `${datum.label} · ${money.format(datum.spent ?? 0)} spent`,
      },
    },
  );
});
</script>

<template>
  <section class="panel l-stack" aria-labelledby="monthly-spending-heading">
    <header class="l-cluster l-split">
      <div>
        <p>Month to date</p>
        <h2 id="monthly-spending-heading">{{ monthLabel }} spending</h2>
        <p>Cumulative household spending against plan</p>
      </div>

      <div>
        <p>{{ formatMoney(spentToDate) }}</p>
        <p>{{ formatMoney(Math.abs(paceDifference)) }} {{ isOnPace ? "under" : "over" }} pace</p>
      </div>
    </header>

    <p aria-label="Chart legend">Solid: spent · dashed: budget pace · dotted: previous month</p>

    <div class="chart">
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
