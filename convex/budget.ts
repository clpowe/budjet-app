import { v } from "convex/values";
import { getEffectiveTimeZone } from "./households";
import { loadActiveGoalQueue, projectActiveGoalAllocations } from "./lib/active_goal_queue";
import { requireHouseholdMember } from "./lib/household_access";
import {
  getSavingsSnapshot,
  listSavingsActivity,
  sumClosedPositiveContributions,
} from "./lib/savings_account";
import { getLocalMonthPeriod } from "../shared/utils/local-date.ts";
import { query } from "./_generated/server";

const DAYS_IN_PLAN = 30n;

const nextGoalSummaryValidator = v.object({
  goalId: v.id("goals"),
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
  }),
  spending: v.object({
    monthToDate: v.object({
      expenseCents: v.int64(),
      savingsFundedCents: v.int64(),
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
  nextGoal: v.union(v.null(), nextGoalSummaryValidator),
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
      loadActiveGoalQueue(ctx, household._id),
    ]);

    const monthToDateSpending = rollups.reduce(
      (sum, rollup) => ({
        expenseCents: sum.expenseCents + rollup.totalSpentCents,
        savingsFundedCents: sum.savingsFundedCents + rollup.spentFromSavingsCents,
        budgetImpactCents:
          sum.budgetImpactCents + (rollup.totalSpentCents - rollup.spentFromSavingsCents),
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
    const todayExpenseCents = currentDayRollup?.totalSpentCents ?? 0n;
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
    const nextAllocation = projectActiveGoalAllocations(
      currentSavings.availableCents,
      activeItems,
    )[0];
    const nextGoal = nextAllocation
      ? {
          goalId: nextAllocation.goal._id,
          name: nextAllocation.goal.name,
          estimatedCostCents: nextAllocation.goal.estimatedCostCents,
          allocatedCents: nextAllocation.allocatedCents,
          remainingCents: nextAllocation.remainingCents,
          progressBasisPoints: nextAllocation.progressBasisPoints,
          ...(nextAllocation.goal.targetDate !== undefined
            ? { targetDate: nextAllocation.goal.targetDate }
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
      },
      spending: {
        monthToDate: {
          ...monthToDateSpending,
          averageDailyBudgetImpactCents,
          budgetImpactVarianceCents,
        },
        today: {
          expenseCents: todayExpenseCents,
          budgetImpactCents: currentSavings.budgetImpactExpenseCents,
        },
      },
      savings,
      nextGoal,
    };
  },
});
