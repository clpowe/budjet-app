import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { getEffectiveTimeZone } from "./households";
import { getAuthenticatedUser } from "./lib/helpers";
import { allocateReserve, getLocalDateKey, getNextLocalDate } from "./lib/want_reserve";

const MAX_ACTIVE_WANTS = 100;

const activeAllocationValidator = v.object({
  itemId: v.id("wantItems"),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
});

const topItemSummaryValidator = v.object({
  itemId: v.id("wantItems"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  allocatedCents: v.int64(),
  remainingCents: v.int64(),
  progressBasisPoints: v.number(),
  targetDate: v.optional(v.number()),
});

const reserveSummaryValidator = v.object({
  positionCents: v.int64(),
  availableReserveCents: v.int64(),
  recoveryAmountCents: v.int64(),
  liveNegativeAdjustmentCents: v.int64(),
  potentialTonightCents: v.int64(),
  activeAllocations: v.array(activeAllocationValidator),
  topItem: v.union(v.null(), topItemSummaryValidator),
});

type EnsureGoalReserveActivatedArgs = {
  householdId: Id<"households">;
  actorId: Id<"users">;
  now: number;
  timeZone: string;
};

export async function ensureGoalReserveActivated(
  ctx: MutationCtx,
  { householdId, actorId, now, timeZone }: EnsureGoalReserveActivatedArgs,
): Promise<void> {
  const existingState = await ctx.db
    .query("goalReserveStates")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();

  if (existingState) {
    return;
  }

  const activationLocalDate = getLocalDateKey(now, timeZone);

  await ctx.db.insert("goalReserveStates", {
    householdId,
    positionCents: 0n,
    activatedAt: now,
    firstEligibleLocalDate: getNextLocalDate(activationLocalDate, timeZone),
    updatedAt: now,
  });
  await ctx.db.insert("goalReserveLedgerEntries", {
    householdId,
    kind: "activation",
    amountCents: 0n,
    localDate: activationLocalDate,
    actorId,
    createdAt: now,
  });
}

type RecordReserveLedgerEntryArgs = {
  householdId: Id<"households">;
  reserveStateId: Id<"goalReserveStates">;
  previousPositionCents: bigint;
  kind: "daily_close" | "correction" | "purchase" | "purchase_undo";
  amountCents: bigint;
  localDate: string;
  now: number;
  lastClosedLocalDate?: string;
  allowanceSnapshotCents?: bigint;
  spendingSnapshotCents?: bigint;
  sourceExpenseId?: Id<"expenses">;
  wantItemId?: Id<"wantItems">;
  actorId?: Id<"users">;
};

export async function recordReserveLedgerEntry(
  ctx: MutationCtx,
  {
    householdId,
    reserveStateId,
    previousPositionCents,
    kind,
    amountCents,
    localDate,
    now,
    lastClosedLocalDate,
    allowanceSnapshotCents,
    spendingSnapshotCents,
    sourceExpenseId,
    wantItemId,
    actorId,
  }: RecordReserveLedgerEntryArgs,
): Promise<bigint> {
  const positionCents = previousPositionCents + amountCents;

  await ctx.db.insert("goalReserveLedgerEntries", {
    householdId,
    kind,
    amountCents,
    localDate,
    allowanceSnapshotCents,
    spendingSnapshotCents,
    sourceExpenseId,
    wantItemId,
    actorId,
    createdAt: now,
  });
  await ctx.db.patch(reserveStateId, {
    positionCents,
    ...(lastClosedLocalDate !== undefined ? { lastClosedLocalDate } : {}),
    updatedAt: now,
  });

  return positionCents;
}

function getProgressBasisPoints(allocatedCents: bigint, estimatedCostCents: bigint): number {
  if (estimatedCostCents <= 0n) {
    throw new Error("Active Want estimated cost must be greater than zero");
  }

  return Number((allocatedCents * 10_000n) / estimatedCostCents);
}

export const getSummary = query({
  args: {
    now: v.number(),
  },
  returns: reserveSummaryValidator,
  handler: async (ctx, args) => {
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
    const currentLocalDate = getLocalDateKey(args.now, timeZone);

    const [state, currentDayRollup, activeItems] = await Promise.all([
      ctx.db
        .query("goalReserveStates")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .unique(),
      ctx.db
        .query("dailyBudgetRollups")
        .withIndex("by_household_and_local_date", (q) =>
          q.eq("householdId", household._id).eq("localDate", currentLocalDate),
        )
        .unique(),
      ctx.db
        .query("wantItems")
        .withIndex("by_household_and_status_and_order", (q) =>
          q.eq("householdId", household._id).eq("status", "plan_for_it"),
        )
        .order("asc")
        .take(MAX_ACTIVE_WANTS + 1),
    ]);

    if (activeItems.length > MAX_ACTIVE_WANTS) {
      throw new Error("Active Want queue exceeds its maximum size");
    }

    if (activeItems.some((item) => item.order === undefined)) {
      throw new Error("Active Want queue contains an item without an order");
    }

    const budgetImpactExpenseCents = currentDayRollup?.budgetImpactExpenseCents ?? 0n;
    const liveNegativeAdjustmentCents =
      budgetImpactExpenseCents > household.allowanceCents
        ? household.allowanceCents - budgetImpactExpenseCents
        : 0n;
    const potentialTonightCents =
      budgetImpactExpenseCents < household.allowanceCents
        ? household.allowanceCents - budgetImpactExpenseCents
        : 0n;

    const positionCents = state?.positionCents ?? 0n;
    const visiblePositionCents = positionCents + liveNegativeAdjustmentCents;
    const availableReserveCents = visiblePositionCents > 0n ? visiblePositionCents : 0n;
    const recoveryAmountCents = visiblePositionCents < 0n ? -visiblePositionCents : 0n;

    const allocations = allocateReserve(
      availableReserveCents,
      activeItems.map((item) => ({
        id: item._id,
        estimatedCostCents: item.estimatedCostCents,
      })),
    );

    const activeAllocations = allocations.map((allocation, index) => {
      const item = activeItems[index];

      if (!item) {
        throw new Error("Active Want allocation is missing its item");
      }

      return {
        itemId: item._id,
        allocatedCents: allocation.allocatedCents,
        remainingCents: allocation.remainingCents,
        progressBasisPoints: getProgressBasisPoints(
          allocation.allocatedCents,
          item.estimatedCostCents,
        ),
      };
    });

    const firstItem = activeItems[0];
    const firstAllocation = activeAllocations[0];
    const topItem =
      firstItem && firstAllocation
        ? {
            itemId: firstItem._id,
            name: firstItem.name,
            estimatedCostCents: firstItem.estimatedCostCents,
            allocatedCents: firstAllocation.allocatedCents,
            remainingCents: firstAllocation.remainingCents,
            progressBasisPoints: firstAllocation.progressBasisPoints,
            targetDate: firstItem.targetDate,
          }
        : null;

    return {
      positionCents,
      availableReserveCents,
      recoveryAmountCents,
      liveNegativeAdjustmentCents,
      potentialTonightCents,
      activeAllocations,
      topItem,
    };
  },
});
