import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { requireHouseholdMember } from "./lib/household_access";
import { getSavingsSnapshot, listSavingsHistory } from "./lib/savings_account";

export const savingsSummaryValidator = v.object({
  positionCents: v.int64(),
  availableSavingsCents: v.int64(),
  recoveryAmountCents: v.int64(),
  todayOverageAdjustmentCents: v.int64(),
  projectedEndOfDayContributionCents: v.int64(),
});

export const getSummary = query({
  args: {
    now: v.number(),
  },
  returns: savingsSummaryValidator,
  handler: (ctx, { now }) => readSavingsSummary(ctx, now),
});

export async function readSavingsSummary(ctx: QueryCtx, now: number) {
  const { household } = await requireHouseholdMember(ctx);
  const savings = await getSavingsSnapshot(ctx, household, now);

  return {
    positionCents: savings.positionCents,
    availableSavingsCents: savings.availableCents,
    recoveryAmountCents: savings.shortfallCents,
    todayOverageAdjustmentCents: savings.todayOverageAdjustmentCents,
    projectedEndOfDayContributionCents: savings.projectedEndOfDayContributionCents,
  };
}

export const savingsHistoryValidator = v.array(
  v.object({
    localDate: v.string(),
    balanceCents: v.int64(),
  }),
);

/**
 * Savings balance at the end of each closed day in the last `days` (1 to 366). Today is not included; read it from `getSummary`.
 */
export const getHistory = query({
  args: {
    now: v.number(),
    days: v.number(),
  },
  returns: savingsHistoryValidator,
  handler: async (ctx, { now, days }) => {
    if (!Number.isFinite(now)) throw new Error("Time must be finite");

    const { household } = await requireHouseholdMember(ctx);
    return await listSavingsHistory(ctx, household, now, days);
  },
});
