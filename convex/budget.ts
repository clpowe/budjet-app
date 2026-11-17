import { v } from "convex/values";
import { getEffectiveTimeZone } from "./households";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue";
import { requireHouseholdMember } from "./lib/household_access";
import { getReserveSnapshot, listReserveActivity } from "./lib/reserve_account";
import { getLocalMonthPeriod } from "./lib/want_reserve";
import { query } from "./_generated/server";

const DAYS_IN_PLAN = 30n;

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
    monthToDate: v.object({
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

export function calculateSafeToSpendCents({
  planAllowanceCents,
  budgetImpactExpenseCents,
  closedPositiveReserveContributionCents,
}: SafeToSpendInputs): bigint {
  return planAllowanceCents - budgetImpactExpenseCents - closedPositiveReserveContributionCents;
}

export const getHomeSummary = query({
  args: {
    asOfTimestamp: v.number(),
  },
  returns: homeSummaryValidator,
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);

    const timeZone = getEffectiveTimeZone(household, args.asOfTimestamp);
    const period = getLocalMonthPeriod(args.asOfTimestamp, timeZone);
    const [{ rollups, reserveDays }, currentReserve, activeItems] = await Promise.all([
      listReserveActivity(ctx, household._id, {
        startLocalDate: period.startLocalDate,
        endExclusiveLocalDate: period.toDateEndExclusiveLocalDate,
      }),
      getReserveSnapshot(ctx, household, args.asOfTimestamp),
      loadActiveWantQueue(ctx, household._id),
    ]);

    const monthToDateSpending = rollups.reduce(
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
      budgetImpactExpenseCents: monthToDateSpending.budgetImpactCents,
      closedPositiveReserveContributionCents,
    });
    const averageDailyBudgetImpactCents =
      monthToDateSpending.budgetImpactCents / BigInt(period.elapsedDays);
    const budgetImpactVarianceCents =
      currentReserve.dailyAllowanceCents * BigInt(period.elapsedDays) -
      monthToDateSpending.budgetImpactCents;
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
        monthToDate: {
          ...monthToDateSpending,
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
