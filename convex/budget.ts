import { v } from "convex/values";
import { getEffectiveTimeZone } from "./households";
import { getAuthenticatedUser } from "./lib/helpers";
import { getLocalDateKey } from "./lib/want_reserve";
import { calculateLiveReserveAmounts } from "./reserve";
import { query } from "./_generated/server";

const DAYS_IN_PLAN = 30n;
const MAX_MONTH_ROWS = 31;

const topItemSummaryValidator = v.object({
  itemId: v.id("wantItems"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
  targetDate: v.optional(v.number()),
});

const homeSummaryValidator = v.object({
  dailyAllowanceCents: v.int64(),
  planAllowanceCents: v.int64(),
  expenseCents: v.int64(),
  reserveFundedExpenseCents: v.int64(),
  budgetImpactExpenseCents: v.int64(),
  currentPlanSetAsideCents: v.int64(),
  safeToSpendCents: v.int64(),
  todayExpenseCents: v.int64(),
  todayBudgetImpactExpenseCents: v.int64(),
  positionCents: v.int64(),
  availableReserveCents: v.int64(),
  recoveryAmountCents: v.int64(),
  liveNegativeAdjustmentCents: v.int64(),
  potentialTonightCents: v.int64(),
  elapsedDays: v.number(),
  averageDailySpendCents: v.int64(),
  varianceCents: v.int64(),
  topItem: v.union(v.null(), topItemSummaryValidator),
});

type SafeToSpendInputs = {
  planAllowanceCents: bigint;
  budgetImpactExpenseCents: bigint;
  currentPlanSetAsideCents: bigint;
};

export function calculateSafeToSpendCents({
  planAllowanceCents,
  budgetImpactExpenseCents,
  currentPlanSetAsideCents,
}: SafeToSpendInputs): bigint {
  return planAllowanceCents - budgetImpactExpenseCents - currentPlanSetAsideCents;
}

function getProgressBasisPoints(allocatedCents: bigint, estimatedCostCents: bigint): number {
  if (estimatedCostCents <= 0n) {
    throw new Error("Active Want estimated cost must be greater than zero");
  }

  return Number((allocatedCents * 10_000n) / estimatedCostCents);
}

export const getHomeSummary = query({
  args: {
    from: v.number(),
    to: v.number(),
    now: v.number(),
  },
  returns: homeSummaryValidator,
  handler: async (ctx, args) => {
    if (args.from >= args.to) {
      throw new Error("Month bounds must be ordered");
    }

    if (args.now < args.from || args.now >= args.to) {
      throw new Error("Summary time must fall within the requested month");
    }

    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    if (household.allowanceCents === undefined) {
      throw new Error("Household money migration is still in progress");
    }

    const timeZone = getEffectiveTimeZone(household, args.now);
    const monthStartLocalDate = getLocalDateKey(args.from, timeZone);
    const monthEndLocalDate = getLocalDateKey(args.to, timeZone);
    const currentLocalDate = getLocalDateKey(args.now, timeZone);

    const [rollups, reserveDays, reserveState, topItem] = await Promise.all([
      ctx.db
        .query("dailyBudgetRollups")
        .withIndex("by_household_and_local_date", (q) =>
          q
            .eq("householdId", household._id)
            .gte("localDate", monthStartLocalDate)
            .lt("localDate", monthEndLocalDate),
        )
        .take(MAX_MONTH_ROWS + 1),
      ctx.db
        .query("goalReserveDays")
        .withIndex("by_household_and_local_date", (q) =>
          q
            .eq("householdId", household._id)
            .gte("localDate", monthStartLocalDate)
            .lt("localDate", monthEndLocalDate),
        )
        .take(MAX_MONTH_ROWS + 1),
      ctx.db
        .query("goalReserveStates")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .unique(),
      ctx.db
        .query("wantItems")
        .withIndex("by_household_and_status_and_order", (q) =>
          q.eq("householdId", household._id).eq("status", "plan_for_it"),
        )
        .order("asc")
        .first(),
    ]);

    if (rollups.length > MAX_MONTH_ROWS) {
      throw new Error("Daily budget rollups exceed the monthly invariant");
    }

    if (reserveDays.length > MAX_MONTH_ROWS) {
      throw new Error("Goal reserve days exceed the monthly invariant");
    }

    const totals = rollups.reduce(
      (sum, rollup) => ({
        expenseCents: sum.expenseCents + rollup.expenseCents,
        reserveFundedExpenseCents: sum.reserveFundedExpenseCents + rollup.reserveFundedExpenseCents,
        budgetImpactExpenseCents: sum.budgetImpactExpenseCents + rollup.budgetImpactExpenseCents,
      }),
      {
        expenseCents: 0n,
        reserveFundedExpenseCents: 0n,
        budgetImpactExpenseCents: 0n,
      },
    );
    const currentPlanSetAsideCents = reserveDays.reduce(
      (sum, day) => sum + (day.contributionCents > 0n ? day.contributionCents : 0n),
      0n,
    );
    const currentDayRollup = rollups.find((rollup) => rollup.localDate === currentLocalDate);
    const todayExpenseCents = currentDayRollup?.expenseCents ?? 0n;
    const todayBudgetImpactExpenseCents = currentDayRollup?.budgetImpactExpenseCents ?? 0n;
    const positionCents = reserveState?.positionCents ?? 0n;
    const reserveAmounts = calculateLiveReserveAmounts(
      positionCents,
      household.allowanceCents,
      todayBudgetImpactExpenseCents,
    );
    const planAllowanceCents = household.allowanceCents * DAYS_IN_PLAN;
    const safeToSpendCents = calculateSafeToSpendCents({
      planAllowanceCents,
      budgetImpactExpenseCents: totals.budgetImpactExpenseCents,
      currentPlanSetAsideCents,
    });
    const elapsedDays = Number(currentLocalDate.slice(8, 10));
    const averageDailySpendCents =
      elapsedDays > 0 ? totals.budgetImpactExpenseCents / BigInt(elapsedDays) : 0n;
    const varianceCents =
      household.allowanceCents * BigInt(elapsedDays) - totals.budgetImpactExpenseCents;
    const topItemAllocatedCents = topItem
      ? reserveAmounts.availableReserveCents < topItem.estimatedCostCents
        ? reserveAmounts.availableReserveCents
        : topItem.estimatedCostCents
      : 0n;
    const compactTopItem = topItem
      ? {
          itemId: topItem._id,
          name: topItem.name,
          estimatedCostCents: topItem.estimatedCostCents,
          allocatedCents: topItemAllocatedCents,
          remainingCents: topItem.estimatedCostCents - topItemAllocatedCents,
          progressBasisPoints: getProgressBasisPoints(
            topItemAllocatedCents,
            topItem.estimatedCostCents,
          ),
          targetDate: topItem.targetDate,
        }
      : null;

    return {
      dailyAllowanceCents: household.allowanceCents,
      planAllowanceCents,
      ...totals,
      currentPlanSetAsideCents,
      safeToSpendCents,
      todayExpenseCents,
      todayBudgetImpactExpenseCents,
      positionCents,
      ...reserveAmounts,
      elapsedDays,
      averageDailySpendCents,
      varianceCents,
      topItem: compactTopItem,
    };
  },
});
