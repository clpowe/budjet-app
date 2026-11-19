import { v } from "convex/values";
import { getEffectiveTimeZone } from "./households";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue";
import { requireHouseholdMember } from "./lib/household_access";
import {
  getSavingsSnapshot,
  listSavingsActivity,
  sumClosedPositiveContributions,
} from "./lib/savings_account";
import { getLocalMonthPeriod } from "../shared/utils/local-date.ts";
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

const savingsBalance = v.object({
  positionCents: v.int64(),
  availableCents: v.int64(),
  recoveryCents: v.int64(),
  todayOverageAdjustmentCents: v.int64(),
  projectedEndOfDayContributionCents: v.int64(),
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
    closedPositiveSavingsContributionCents: v.int64(),
    closedPositiveReserveContributionCents: v.int64(),
  }),
  spending: v.object({
    monthToDate: v.object({
      expenseCents: v.int64(),
      savingsFundedCents: v.int64(),
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
  savings: savingsBalance,
  reserve: savingsBalance,
  nextPlannedWant: v.union(v.null(), nextPlannedWantSummaryValidator),
});

type SafeToSpendInputs = {
  planAllowanceCents: bigint;
  budgetImpactExpenseCents: bigint;
  closedPositiveSavingsContributionCents: bigint;
};

export function calculateSafeToSpendCents({
  planAllowanceCents,
  budgetImpactExpenseCents,
  closedPositiveSavingsContributionCents,
}: SafeToSpendInputs): bigint {
  return planAllowanceCents - budgetImpactExpenseCents - closedPositiveSavingsContributionCents;
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
    const [{ rollups }, currentSavings, activeItems] = await Promise.all([
      listSavingsActivity(ctx, household._id, {
        startLocalDate: period.startLocalDate,
        endExclusiveLocalDate: period.toDateEndExclusiveLocalDate,
      }),
      getSavingsSnapshot(ctx, household, args.asOfTimestamp),
      loadActiveWantQueue(ctx, household._id),
    ]);

    const monthToDateSpending = rollups.reduce(
      (sum, rollup) => ({
        expenseCents: sum.expenseCents + rollup.expenseCents,
        savingsFundedCents:
          sum.savingsFundedCents +
          (rollup.savingsFundedExpenseCents ?? rollup.reserveFundedExpenseCents),
        budgetImpactCents: sum.budgetImpactCents + rollup.budgetImpactExpenseCents,
      }),
      {
        expenseCents: 0n,
        savingsFundedCents: 0n,
        budgetImpactCents: 0n,
      },
    );
    // Only positive closes move plan allowance into savings. Negative closes are
    // already represented by the month's budget-impact spending.
    const closedPositiveSavingsContributionCents = sumClosedPositiveContributions({
      rollups,
      allowanceCents: currentSavings.dailyAllowanceCents,
      firstEligibleLocalDate: currentSavings.firstEligibleLocalDate,
      todayLocalDate: currentSavings.localDate,
      startLocalDate: period.startLocalDate,
      endExclusiveLocalDate: period.toDateEndExclusiveLocalDate,
      timeZone,
    });
    const currentDayRollup = rollups.find((rollup) => rollup.localDate === period.currentLocalDate);
    const todayExpenseCents = currentDayRollup?.expenseCents ?? 0n;
    // Safe-to-spend uses the product's fixed 30-day plan even though pace is
    // reported for the household's calendar month to date.
    const planAllowanceCents = currentSavings.dailyAllowanceCents * DAYS_IN_PLAN;
    const safeToSpendCents = calculateSafeToSpendCents({
      planAllowanceCents,
      budgetImpactExpenseCents: monthToDateSpending.budgetImpactCents,
      closedPositiveSavingsContributionCents,
    });
    const averageDailyBudgetImpactCents =
      monthToDateSpending.budgetImpactCents / BigInt(period.elapsedDays);
    const budgetImpactVarianceCents =
      currentSavings.dailyAllowanceCents * BigInt(period.elapsedDays) -
      monthToDateSpending.budgetImpactCents;
    const nextAllocation = projectActiveWantAllocations(
      currentSavings.availableCents,
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

    const savings = {
      positionCents: currentSavings.positionCents,
      availableCents: currentSavings.availableCents,
      recoveryCents: currentSavings.shortfallCents,
      todayOverageAdjustmentCents: currentSavings.todayOverageAdjustmentCents,
      projectedEndOfDayContributionCents: currentSavings.projectedEndOfDayContributionCents,
    };

    return {
      period: {
        localMonth: period.localMonth,
        elapsedDays: period.elapsedDays,
      },
      plan: {
        dailyAllowanceCents: currentSavings.dailyAllowanceCents,
        allowanceCents: planAllowanceCents,
        safeToSpendCents,
        closedPositiveSavingsContributionCents,
        closedPositiveReserveContributionCents: closedPositiveSavingsContributionCents,
      },
      spending: {
        monthToDate: {
          ...monthToDateSpending,
          reserveFundedCents: monthToDateSpending.savingsFundedCents,
          averageDailyBudgetImpactCents,
          budgetImpactVarianceCents,
        },
        today: {
          expenseCents: todayExpenseCents,
          budgetImpactCents: currentSavings.budgetImpactExpenseCents,
        },
      },
      savings,
      reserve: savings,
      nextPlannedWant,
    };
  },
});
