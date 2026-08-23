import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { loadActiveWantQueue, projectActiveWantAllocations } from "./lib/active_want_queue.ts";
import { getAuthenticatedUser } from "./lib/helpers";
import { getCurrentReserveSnapshot } from "./lib/live_reserve";
import { getLocalDateKey, getNextLocalDate } from "./lib/want_reserve";

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

export type ReserveEvent =
  | {
      kind: "daily_close";
      localDate: string;
      allowanceCents: bigint;
      spendingCents: bigint;
    }
  | {
      kind: "purchase";
      localDate: string;
      reserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "purchase_undo";
      localDate: string;
      reserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "purchase_correction";
      localDate: string;
      previousReserveUsedCents: bigint;
      nextReserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "closed_day_correction";
      localDate: string;
      budgetImpactDeltaCents: bigint;
      expenseId: Id<"expenses">;
      actorId: Id<"users">;
    };

type ReserveTransition = {
  amountCents: bigint;
  positionCents: bigint;
  lastClosedLocalDate?: string;
};

function assertNonNegativeCents(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
}

export function reduceReserveEvent(
  state: Doc<"goalReserveStates">,
  event: ReserveEvent,
): ReserveTransition {
  let amountCents: bigint;

  switch (event.kind) {
    case "daily_close": {
      assertNonNegativeCents(event.allowanceCents, "Allowance");
      assertNonNegativeCents(event.spendingCents, "Spending");

      if (event.localDate < state.firstEligibleLocalDate) {
        throw new Error("Cannot close a reserve day before the first eligible date");
      }

      if (state.lastClosedLocalDate !== undefined && event.localDate <= state.lastClosedLocalDate) {
        throw new Error("Reserve days must close after the recorded close cursor");
      }

      amountCents = event.allowanceCents - event.spendingCents;
      break;
    }
    case "purchase": {
      assertNonNegativeCents(event.reserveUsedCents, "Reserve used");
      amountCents = -event.reserveUsedCents;
      break;
    }
    case "purchase_undo": {
      assertNonNegativeCents(event.reserveUsedCents, "Reserve used");
      amountCents = event.reserveUsedCents;
      break;
    }
    case "purchase_correction": {
      assertNonNegativeCents(event.previousReserveUsedCents, "Previous reserve used");
      assertNonNegativeCents(event.nextReserveUsedCents, "Next reserve used");
      amountCents = event.previousReserveUsedCents - event.nextReserveUsedCents;
      break;
    }
    case "closed_day_correction": {
      amountCents = -event.budgetImpactDeltaCents;
      break;
    }
  }

  return {
    amountCents,
    positionCents: state.positionCents + amountCents,
    ...(event.kind === "daily_close" ? { lastClosedLocalDate: event.localDate } : {}),
  };
}

export async function applyReserveEvent(
  ctx: MutationCtx,
  state: Doc<"goalReserveStates">,
  event: ReserveEvent,
  now: number,
): Promise<Doc<"goalReserveStates">> {
  const transition = reduceReserveEvent(state, event);
  const commonLedgerFields = {
    householdId: state.householdId,
    amountCents: transition.amountCents,
    localDate: event.localDate,
    createdAt: now,
  };

  switch (event.kind) {
    case "daily_close":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "daily_close",
        allowanceSnapshotCents: event.allowanceCents,
        spendingSnapshotCents: event.spendingCents,
      });
      break;
    case "purchase":
    case "purchase_undo":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: event.kind,
        sourceExpenseId: event.expenseId,
        wantItemId: event.wantItemId,
        actorId: event.actorId,
      });
      break;
    case "purchase_correction":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "correction",
        sourceExpenseId: event.expenseId,
        wantItemId: event.wantItemId,
        actorId: event.actorId,
      });
      break;
    case "closed_day_correction": {
      const closedDay = await ctx.db
        .query("goalReserveDays")
        .withIndex("by_household_and_local_date", (q) =>
          q.eq("householdId", state.householdId).eq("localDate", event.localDate),
        )
        .unique();

      if (!closedDay) {
        throw new Error("Cannot correct a reserve day that has not been closed");
      }

      const spendingSnapshotCents = closedDay.spendingSnapshotCents + event.budgetImpactDeltaCents;
      assertNonNegativeCents(spendingSnapshotCents, "Closed-day spending");

      await ctx.db.patch(closedDay._id, {
        spendingSnapshotCents,
        contributionCents: closedDay.allowanceSnapshotCents - spendingSnapshotCents,
        updatedAt: now,
      });
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "correction",
        allowanceSnapshotCents: closedDay.allowanceSnapshotCents,
        spendingSnapshotCents,
        sourceExpenseId: event.expenseId,
        actorId: event.actorId,
      });
      break;
    }
  }

  const statePatch = {
    positionCents: transition.positionCents,
    ...(transition.lastClosedLocalDate !== undefined
      ? { lastClosedLocalDate: transition.lastClosedLocalDate }
      : {}),
    updatedAt: now,
  };

  await ctx.db.patch(state._id, statePatch);

  return { ...state, ...statePatch };
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

    const [currentReserve, activeItems] = await Promise.all([
      getCurrentReserveSnapshot(ctx, household, args.now),
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
