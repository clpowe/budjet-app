import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { getStoredHouseholdTimeZone } from "./households";
import { applyReserveEvent } from "./reserve";
import { getLocalDateKey, getNextLocalDate } from "./lib/want_reserve";

export const CLOSE_DAYS_PER_TRANSACTION = 31;
export const HOUSEHOLDS_PER_BATCH = 25;

const cursorValidator = v.union(v.string(), v.null());

const closeResultValidator = v.object({
  complete: v.boolean(),
  lastClosedLocalDate: v.optional(v.string()),
});

type CloseDaysThroughArgs = {
  householdId: Id<"households">;
  throughExclusiveTimestamp: number;
  maxDays: number;
};

export async function closeDaysThrough(
  ctx: MutationCtx,
  { householdId, throughExclusiveTimestamp, maxDays }: CloseDaysThroughArgs,
): Promise<{ complete: boolean; lastClosedLocalDate?: string }> {
  if (!Number.isFinite(throughExclusiveTimestamp)) {
    throw new Error("Closing timestamp must be finite");
  }

  if (!Number.isInteger(maxDays) || maxDays < 1) {
    throw new Error("Maximum closed days must be a positive integer");
  }

  const household = await ctx.db.get(householdId);

  if (!household) {
    throw new Error("Household not found");
  }

  if (household.allowanceCents === undefined) {
    throw new Error("Household money migration is still in progress");
  }

  const reserveState = await ctx.db
    .query("goalReserveStates")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();

  if (!reserveState) {
    return { complete: true };
  }

  const timeZone = getStoredHouseholdTimeZone(household);
  const throughExclusiveLocalDate = getLocalDateKey(throughExclusiveTimestamp, timeZone);
  const maximumDays = Math.min(maxDays, CLOSE_DAYS_PER_TRANSACTION);

  let nextLocalDate = reserveState.lastClosedLocalDate
    ? getNextLocalDate(reserveState.lastClosedLocalDate, timeZone)
    : reserveState.firstEligibleLocalDate;
  let currentReserveState = reserveState;
  let lastClosedLocalDate = reserveState.lastClosedLocalDate;
  let closedDayCount = 0;

  while (nextLocalDate < throughExclusiveLocalDate && closedDayCount < maximumDays) {
    const existingDay = await ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", nextLocalDate),
      )
      .unique();

    if (existingDay) {
      throw new Error("Reserve day already exists before the recorded close cursor");
    }

    const rollup = await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", nextLocalDate),
      )
      .unique();

    const spendingSnapshotCents = rollup?.budgetImpactExpenseCents ?? 0n;
    const contributionCents = household.allowanceCents - spendingSnapshotCents;

    await ctx.db.insert("goalReserveDays", {
      householdId,
      localDate: nextLocalDate,
      timeZone,
      allowanceSnapshotCents: household.allowanceCents,
      spendingSnapshotCents,
      contributionCents,
      closedAt: throughExclusiveTimestamp,
      updatedAt: throughExclusiveTimestamp,
    });

    currentReserveState = await applyReserveEvent(
      ctx,
      currentReserveState,
      {
        kind: "daily_close",
        localDate: nextLocalDate,
        allowanceCents: household.allowanceCents,
        spendingCents: spendingSnapshotCents,
      },
      throughExclusiveTimestamp,
    );

    lastClosedLocalDate = nextLocalDate;
    nextLocalDate = getNextLocalDate(nextLocalDate, timeZone);
    closedDayCount += 1;
  }

  if (
    household.pendingTimeZone !== undefined &&
    household.pendingTimeZoneEffectiveAt !== undefined &&
    throughExclusiveTimestamp >= household.pendingTimeZoneEffectiveAt
  ) {
    const finalOldTimeZoneDate = getLocalDateKey(
      household.pendingTimeZoneEffectiveAt - 1,
      timeZone,
    );

    if (lastClosedLocalDate !== undefined && lastClosedLocalDate >= finalOldTimeZoneDate) {
      await ctx.db.patch(household._id, {
        timeZone: household.pendingTimeZone,
        pendingTimeZone: undefined,
        pendingTimeZoneEffectiveAt: undefined,
      });
    }
  }

  return {
    complete: nextLocalDate >= throughExclusiveLocalDate,
    ...(lastClosedLocalDate !== undefined ? { lastClosedLocalDate } : {}),
  };
}

export const closeThrough = internalMutation({
  args: {
    householdId: v.id("households"),
    throughExclusiveTimestamp: v.number(),
    maxDays: v.number(),
  },
  returns: closeResultValidator,
  handler: async (ctx, args) => {
    return await closeDaysThrough(ctx, args);
  },
});

export async function scheduleReserveCatchUp(ctx: MutationCtx): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.reserveMaintenance.closeEligibleDays, {
    cursor: null,
  });
}

export const closeEligibleDays = internalMutation({
  args: {
    cursor: cursorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    const page = await ctx.db.query("goalReserveStates").paginate({
      cursor: args.cursor,
      numItems: HOUSEHOLDS_PER_BATCH,
    });

    let hasIncompleteHousehold = false;

    for (const reserveState of page.page) {
      const result = await closeDaysThrough(ctx, {
        householdId: reserveState.householdId,
        throughExclusiveTimestamp: serverNow,
        maxDays: CLOSE_DAYS_PER_TRANSACTION,
      });

      if (!result.complete) {
        hasIncompleteHousehold = true;
      }
    }

    if (!page.isDone || hasIncompleteHousehold) {
      await ctx.scheduler.runAfter(0, internal.reserveMaintenance.closeEligibleDays, {
        cursor: page.isDone ? null : page.continueCursor,
      });
    }

    return null;
  },
});
