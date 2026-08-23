import { v } from "convex/values";
import { getEffectiveTimeZone } from "./households";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue";
import { getAuthenticatedUser } from "./lib/helpers";
import { getCurrentReserveSnapshot } from "./lib/live_reserve";
import { getLocalMonthPeriod } from "./lib/want_reserve";
import { query } from "./_generated/server";

const DAYS_IN_PLAN = 30n;
const MAX_MONTH_ROWS = 31;

const nextPlannedWantSummaryValidator = v.object({
  itemId: v.id("wantItems"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
  targetDate: v.optional(v.number()),
});

const homeSummaryValidator = v.object({
  period: v.object({
    localMonth: v.string(),
    elapsedDays: v.number(),
  }),
  plan: v.object({
    dailyAllowanceCents: v.int64(),
    allowanceCents: v.int64(),
    safeToSpendCents: v.int64(),
    closedPositiveReserveContributionCents: v.int64(),
  }),
  spending: v.object({
    month: v.object({
      expenseCents: v.int64(),
      reserveFundedCents: v.int64(),
      budgetImpactCents: v.int64(),
      averageDailyBudgetImpactCents: v.int64(),
      budgetImpactVarianceCents: v.int64(),
    }),
    today: v.object({
      expenseCents: v.int64(),
      budgetImpactCents: v.int64(),
    }),
  }),
  reserve: v.object({
    positionCents: v.int64(),
    availableCents: v.int64(),
    recoveryCents: v.int64(),
    todayOverageAdjustmentCents: v.int64(),
    projectedEndOfDayContributionCents: v.int64(),
  }),
  nextPlannedWant: v.union(v.null(), nextPlannedWantSummaryValidator),
});

type SafeToSpendInputs = {
  planAllowanceCents: bigint;
  budgetImpactExpenseCents: bigint;
  closedPositiveReserveContributionCents: bigint;
};

type LocalDateRow = {
  localDate: string;
};

export function calculateSafeToSpendCents({
  planAllowanceCents,
  budgetImpactExpenseCents,
  closedPositiveReserveContributionCents,
}: SafeToSpendInputs): bigint {
  return planAllowanceCents - budgetImpactExpenseCents - closedPositiveReserveContributionCents;
}

function assertValidMonthlyRows(rows: readonly LocalDateRow[], label: string): void {
  if (rows.length > MAX_MONTH_ROWS) {
    throw new Error(`${label} exceed the monthly invariant`);
  }

  const localDates = new Set<string>();

  for (const row of rows) {
    if (localDates.has(row.localDate)) {
      throw new Error(`${label} contain duplicate local dates`);
    }

    localDates.add(row.localDate);
  }
}

export const getHomeSummary = query({
  args: {
    asOfTimestamp: v.number(),
  },
  returns: homeSummaryValidator,
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    const timeZone = getEffectiveTimeZone(household, args.asOfTimestamp);
    const period = getLocalMonthPeriod(args.asOfTimestamp, timeZone);
    const [rollups, reserveDays, currentReserve, activeItems] = await Promise.all([
      ctx.db
        .query("dailyBudgetRollups")
        .withIndex("by_household_and_local_date", (q) =>
          q
            .eq("householdId", household._id)
            .gte("localDate", period.startLocalDate)
            .lt("localDate", period.toDateEndExclusiveLocalDate),
        )
        .take(MAX_MONTH_ROWS + 1),
      ctx.db
        .query("goalReserveDays")
        .withIndex("by_household_and_local_date", (q) =>
          q
            .eq("householdId", household._id)
            .gte("localDate", period.startLocalDate)
            .lt("localDate", period.toDateEndExclusiveLocalDate),
        )
        .take(MAX_MONTH_ROWS + 1),
      getCurrentReserveSnapshot(ctx, household, args.asOfTimestamp),
      loadActiveWantQueue(ctx, household._id),
    ]);

    assertValidMonthlyRows(rollups, "Daily budget rollups");
    assertValidMonthlyRows(reserveDays, "Goal reserve days");

    const monthSpending = rollups.reduce(
      (sum, rollup) => ({
        expenseCents: sum.expenseCents + rollup.expenseCents,
        reserveFundedCents: sum.reserveFundedCents + rollup.reserveFundedExpenseCents,
        budgetImpactCents: sum.budgetImpactCents + rollup.budgetImpactExpenseCents,
      }),
      {
        expenseCents: 0n,
        reserveFundedCents: 0n,
        budgetImpactCents: 0n,
      },
    );
    // Only positive closes move plan allowance into reserve. Negative closes are
    // already represented by the month's budget-impact spending.
    const closedPositiveReserveContributionCents = reserveDays.reduce(
      (sum, day) => sum + (day.contributionCents > 0n ? day.contributionCents : 0n),
      0n,
    );
    const currentDayRollup = rollups.find((rollup) => rollup.localDate === period.currentLocalDate);
    const todayExpenseCents = currentDayRollup?.expenseCents ?? 0n;
    // Safe-to-spend uses the product's fixed 30-day plan even though pace is
    // reported for the household's calendar month to date.
    const planAllowanceCents = currentReserve.dailyAllowanceCents * DAYS_IN_PLAN;
    const safeToSpendCents = calculateSafeToSpendCents({
      planAllowanceCents,
      budgetImpactExpenseCents: monthSpending.budgetImpactCents,
      closedPositiveReserveContributionCents,
    });
    const averageDailyBudgetImpactCents =
      monthSpending.budgetImpactCents / BigInt(period.elapsedDays);
    const budgetImpactVarianceCents =
      currentReserve.dailyAllowanceCents * BigInt(period.elapsedDays) -
      monthSpending.budgetImpactCents;
    const nextAllocation = projectActiveWantAllocations(
      currentReserve.availableCents,
      activeItems,
    )[0];
    const nextPlannedWant = nextAllocation
      ? {
          itemId: nextAllocation.item._id,
          name: nextAllocation.item.name,
          estimatedCostCents: nextAllocation.item.estimatedCostCents,
          allocatedCents: nextAllocation.allocatedCents,
          remainingCents: nextAllocation.remainingCents,
          progressBasisPoints: nextAllocation.progressBasisPoints,
          ...(nextAllocation.item.targetDate !== undefined
            ? { targetDate: nextAllocation.item.targetDate }
            : {}),
        }
      : null;

    return {
      period: {
        localMonth: period.localMonth,
        elapsedDays: period.elapsedDays,
      },
      plan: {
        dailyAllowanceCents: currentReserve.dailyAllowanceCents,
        allowanceCents: planAllowanceCents,
        safeToSpendCents,
        closedPositiveReserveContributionCents,
      },
      spending: {
        month: {
          ...monthSpending,
          averageDailyBudgetImpactCents,
          budgetImpactVarianceCents,
        },
        today: {
          expenseCents: todayExpenseCents,
          budgetImpactCents: currentReserve.budgetImpactExpenseCents,
        },
      },
      reserve: {
        positionCents: currentReserve.positionCents,
        availableCents: currentReserve.availableCents,
        recoveryCents: currentReserve.recoveryCents,
        todayOverageAdjustmentCents: currentReserve.todayOverageAdjustmentCents,
        projectedEndOfDayContributionCents: currentReserve.projectedEndOfDayContributionCents,
      },
      nextPlannedWant,
    };
  },
});
