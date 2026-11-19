import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue.ts";
import { requireHouseholdMember } from "./lib/household_access";
import { getSavingsSnapshot } from "./lib/savings_account";

const activeAllocationValidator = v.object({
  itemId: v.id("wantItems"),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
});

export const savingsSummaryValidator = v.object({
  positionCents: v.int64(),
  availableSavingsCents: v.int64(),
  recoveryAmountCents: v.int64(),
  todayOverageAdjustmentCents: v.int64(),
  projectedEndOfDayContributionCents: v.int64(),
  activeAllocations: v.array(activeAllocationValidator),
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

  const [currentSavings, activeItems] = await Promise.all([
    getSavingsSnapshot(ctx, household, now),
    loadActiveWantQueue(ctx, household._id),
  ]);

  const activeAllocations = projectActiveWantAllocations(
    currentSavings.availableCents,
    activeItems,
  ).map(({ item, allocatedCents, remainingCents, progressBasisPoints }) => ({
    itemId: item._id,
    allocatedCents,
    remainingCents,
    progressBasisPoints,
  }));

  return {
    positionCents: currentSavings.positionCents,
    availableSavingsCents: currentSavings.availableCents,
    recoveryAmountCents: currentSavings.shortfallCents,
    todayOverageAdjustmentCents: currentSavings.todayOverageAdjustmentCents,
    projectedEndOfDayContributionCents: currentSavings.projectedEndOfDayContributionCents,
    activeAllocations,
  };
}
