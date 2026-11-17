import { v } from "convex/values";
import { query } from "./_generated/server";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue.ts";
import { requireHouseholdMember } from "./lib/household_access";
import { getReserveSnapshot } from "./lib/reserve_account";

const activeAllocationValidator = v.object({
  itemId: v.id("wantItems"),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
});

const reserveSummaryValidator = v.object({
  positionCents: v.int64(),
  availableReserveCents: v.int64(),
  recoveryAmountCents: v.int64(),
  todayOverageAdjustmentCents: v.int64(),
  projectedEndOfDayContributionCents: v.int64(),
  activeAllocations: v.array(activeAllocationValidator),
});

export const getSummary = query({
  args: {
    now: v.number(),
  },
  returns: reserveSummaryValidator,
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);

    const [currentReserve, activeItems] = await Promise.all([
      getReserveSnapshot(ctx, household, args.now),
      loadActiveWantQueue(ctx, household._id),
    ]);

    const activeAllocations = projectActiveWantAllocations(
      currentReserve.availableCents,
      activeItems,
    ).map(({ item, allocatedCents, remainingCents, progressBasisPoints }) => ({
      itemId: item._id,
      allocatedCents,
      remainingCents,
      progressBasisPoints,
    }));

    return {
      positionCents: currentReserve.positionCents,
      availableReserveCents: currentReserve.availableCents,
      recoveryAmountCents: currentReserve.recoveryCents,
      todayOverageAdjustmentCents: currentReserve.todayOverageAdjustmentCents,
      projectedEndOfDayContributionCents: currentReserve.projectedEndOfDayContributionCents,
      activeAllocations,
    };
  },
});
