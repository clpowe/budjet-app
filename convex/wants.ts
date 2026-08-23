import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { centsToLegacyDollars } from "./expenses";
import { getEffectiveTimeZone } from "./households";
import { applyExpenseDelta, type ExpenseFacts } from "./lib/daily_budget_rollups";
import {
  appendActiveWant,
  loadActiveWantQueue,
  MAX_ACTIVE_WANTS,
  removeActiveWant,
  reorderActiveWants,
} from "./lib/active_want_queue.ts";
import { getAuthenticatedUser } from "./lib/helpers";
import { projectCurrentReserve, getCurrentReserveSnapshot } from "./lib/live_reserve";
import {
  allocateReserve,
  calculateLowerItemImpact,
  calculatePurchaseFunding,
  getLocalDateKey,
  getLocalDayBounds,
} from "./lib/want_reserve";
import {
  CLOSE_DAYS_PER_TRANSACTION,
  closeDaysThrough,
  scheduleReserveCatchUp,
} from "./reserveMaintenance";
import { applyReserveEvent, ensureGoalReserveActivated } from "./reserve";

export const INACTIVE_WANTS_PAGE_SIZE = 25;

const wantPriorityValidator = v.union(v.literal("high"), v.literal("medium"), v.literal("low"));

const wantStatusValidator = v.union(
  v.literal("considering"),
  v.literal("plan_for_it"),
  v.literal("not_now"),
  v.literal("bought"),
);

const inactiveWantStatusValidator = v.union(
  v.literal("considering"),
  v.literal("not_now"),
  v.literal("bought"),
);

const wantItemValidator = v.object({
  _id: v.id("wantItems"),
  _creationTime: v.number(),
  householdId: v.id("households"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  priority: wantPriorityValidator,
  targetDate: v.optional(v.number()),
  notes: v.string(),
  status: wantStatusValidator,
  order: v.optional(v.number()),
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  purchasedBy: v.optional(v.id("users")),
  purchasedAt: v.optional(v.number()),
  expenseId: v.optional(v.id("expenses")),
});

const changeStatusResultValidator = v.union(
  v.object({
    kind: v.literal("updated"),
    item: wantItemValidator,
  }),
  v.object({
    kind: v.literal("money_migration_pending"),
  }),
);

const lowerItemImpactValidator = v.object({
  itemId: v.id("wantItems"),
  name: v.string(),
  lostCents: v.int64(),
  allocatedCentsAfter: v.int64(),
});

const previewPurchaseResultValidator = v.object({
  reserveUsedCents: v.int64(),
  budgetImpactCents: v.int64(),
  lowerItemImpacts: v.array(lowerItemImpactValidator),
});

const purchaseResultValidator = v.union(
  v.object({
    status: v.literal("reserve_syncing"),
  }),
  v.object({
    status: v.literal("purchased"),
    expenseId: v.id("expenses"),
    reserveUsedCents: v.int64(),
    budgetImpactCents: v.int64(),
  }),
);

const correctPurchaseResultValidator = v.object({
  success: v.literal(true),
  expenseId: v.id("expenses"),
  reserveUsedCents: v.int64(),
  budgetImpactCents: v.int64(),
});

const undoPurchaseResultValidator = v.object({
  success: v.literal(true),
});

type DatabaseCtx = MutationCtx | QueryCtx;

function normalizeName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Want name is required");
  }

  return normalizedName;
}

function normalizeNotes(notes: string): string {
  return notes.trim();
}

function assertPositiveCents(cents: bigint, label: string): void {
  if (cents <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
}

function assertFiniteTargetDate(targetDate: number | null): void {
  if (targetDate !== null && !Number.isFinite(targetDate)) {
    throw new Error("Target date must be finite");
  }
}

function assertInactivePageSize(numItems: number): void {
  if (numItems !== INACTIVE_WANTS_PAGE_SIZE) {
    throw new Error(`Inactive Want pages must contain ${INACTIVE_WANTS_PAGE_SIZE} items`);
  }
}

async function requireHouseholdWant(
  ctx: DatabaseCtx,
  wantItemId: Id<"wantItems">,
  householdId: Id<"households">,
): Promise<Doc<"wantItems">> {
  const wantItem = await ctx.db.get(wantItemId);

  if (!wantItem || wantItem.householdId !== householdId) {
    throw new Error("Want item not found");
  }

  return wantItem;
}

async function requireLinkedPurchase(
  ctx: MutationCtx,
  itemId: Id<"wantItems">,
  householdId: Id<"households">,
): Promise<{
  item: Doc<"wantItems">;
  expense: Doc<"expenses">;
}> {
  const item = await requireHouseholdWant(ctx, itemId, householdId);

  if (item.status !== "bought" || !item.expenseId) {
    throw new Error("Want item does not have a linked purchase");
  }

  const expense = await ctx.db.get(item.expenseId);

  if (!expense || expense.householdId !== householdId || expense.wantItemId !== item._id) {
    throw new Error("Linked purchase expense not found");
  }

  if (expense.amountCents === undefined) {
    throw new Error("Linked purchase is missing its cent-valued amount");
  }

  const reserveUsedCents = expense.reserveUsedCents ?? 0n;

  if (reserveUsedCents < 0n || reserveUsedCents > expense.amountCents) {
    throw new Error("Linked purchase contains invalid reserve funding");
  }

  return { item, expense };
}

export const list = query({
  args: {},
  returns: v.object({
    active: v.array(wantItemValidator),
  }),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const householdId = user.householdId;

    if (!householdId) {
      throw new Error("User is not in a household");
    }

    const active = await ctx.db
      .query("wantItems")
      .withIndex("by_household_and_status_and_order", (q) =>
        q.eq("householdId", householdId).eq("status", "plan_for_it"),
      )
      .order("asc")
      .take(MAX_ACTIVE_WANTS + 1);

    if (active.length > MAX_ACTIVE_WANTS) {
      throw new Error("Active Want queue exceeds its maximum size");
    }

    if (active.some((item) => item.order === undefined)) {
      throw new Error("Active Want queue contains an item without an order");
    }

    return { active };
  },
});

export const listSection = query({
  args: {
    status: inactiveWantStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(wantItemValidator),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const householdId = user.householdId;

    if (!householdId) {
      throw new Error("User is not in a household");
    }

    assertInactivePageSize(args.paginationOpts.numItems);

    return await ctx.db
      .query("wantItems")
      .withIndex("by_household_and_status", (q) =>
        q.eq("householdId", householdId).eq("status", args.status),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: wantPriorityValidator,
    targetDate: v.optional(v.number()),
    notes: v.string(),
  },
  returns: wantItemValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");

    if (args.targetDate !== undefined && !Number.isFinite(args.targetDate)) {
      throw new Error("Target date must be finite");
    }

    const wantItemId = await ctx.db.insert("wantItems", {
      householdId: user.householdId,
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      ...(args.targetDate !== undefined ? { targetDate: args.targetDate } : {}),
      notes: normalizeNotes(args.notes),
      status: "considering",
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const wantItem = await ctx.db.get(wantItemId);

    if (!wantItem) {
      throw new Error("Failed to create Want item");
    }

    return wantItem;
  },
});

export const update = mutation({
  args: {
    itemId: v.id("wantItems"),
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: wantPriorityValidator,
    targetDate: v.union(v.number(), v.null()),
    notes: v.string(),
  },
  returns: wantItemValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const wantItem = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    if (wantItem.status === "bought") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");
    assertFiniteTargetDate(args.targetDate);

    await ctx.db.patch(wantItem._id, {
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      targetDate: args.targetDate === null ? undefined : args.targetDate,
      notes: normalizeNotes(args.notes),
      updatedBy: user._id,
      updatedAt: now,
    });

    const updatedWantItem = await ctx.db.get(wantItem._id);

    if (!updatedWantItem) {
      throw new Error("Want item disappeared during update");
    }

    return updatedWantItem;
  },
});

export const changeStatus = mutation({
  args: {
    itemId: v.id("wantItems"),
    status: wantStatusValidator,
  },
  returns: changeStatusResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const wantItem = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    if (wantItem.status === "bought" || args.status === "bought") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    const isActivating = args.status === "plan_for_it" && wantItem.status !== "plan_for_it";

    if (isActivating && household.moneyMigrationCompletedAt === undefined) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHousehold, {
        householdId: household._id,
        expenseCursor: null,
        timeZone: null,
      });

      return {
        kind: "money_migration_pending" as const,
      };
    }

    if (isActivating) {
      await appendActiveWant(ctx, {
        item: wantItem,
        actorId: user._id,
        now,
        queueFullErrorMessage:
          "Move an item to Considering or Not now before planning another purchase",
      });
    } else if (wantItem.status === "plan_for_it" && args.status !== "plan_for_it") {
      await removeActiveWant(ctx, {
        item: wantItem,
        nextStatus: args.status,
        actorId: user._id,
        now,
      });
    } else if (wantItem.status !== args.status) {
      // This is an inactive-to-inactive transition.
      await ctx.db.patch(wantItem._id, {
        status: args.status,
        order: undefined,
        updatedBy: user._id,
        updatedAt: now,
      });
    } else {
      // Preserve the existing behavior of refreshing update metadata.
      await ctx.db.patch(wantItem._id, {
        updatedBy: user._id,
        updatedAt: now,
      });
    }

    if (isActivating) {
      await ensureGoalReserveActivated(ctx, {
        householdId: household._id,
        actorId: user._id,
        now,
        timeZone: getEffectiveTimeZone(household, now),
      });
    }

    const updatedWantItem = await ctx.db.get(wantItem._id);

    if (!updatedWantItem) {
      throw new Error("Want item disappeared during status change");
    }

    return {
      kind: "updated" as const,
      item: updatedWantItem,
    };
  },
});

export const reorder = mutation({
  args: {
    itemIds: v.array(v.id("wantItems")),
  },
  returns: v.object({
    success: v.literal(true),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    await reorderActiveWants(ctx, {
      householdId: user.householdId,
      itemIds: args.itemIds,
      actorId: user._id,
      now,
    });

    return { success: true as const };
  },
});

export const previewPurchase = query({
  args: {
    itemId: v.id("wantItems"),
    actualAmountCents: v.int64(),
    now: v.number(),
  },
  returns: previewPurchaseResultValidator,
  handler: async (ctx, args) => {
    assertPositiveCents(args.actualAmountCents, "Actual amount");

    if (!Number.isFinite(args.now)) {
      throw new Error("Preview time must be finite");
    }

    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const item = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    if (item.status !== "plan_for_it") {
      throw new Error("Only planned Want items can be purchased");
    }

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    const reserveContext = await getCurrentReserveSnapshot(ctx, household, args.now);
    const activeItems = await loadActiveWantQueue(ctx, household._id);
    const selectedIndex = activeItems.findIndex((activeItem) => activeItem._id === item._id);

    if (selectedIndex < 0) {
      throw new Error("Want item is not in the active queue");
    }

    const allocations = allocateReserve(
      reserveContext.availableCents,
      activeItems.map((activeItem) => ({
        id: activeItem._id,
        estimatedCostCents: activeItem.estimatedCostCents,
      })),
    );
    const selectedAllocation = allocations[selectedIndex];

    if (!selectedAllocation) {
      throw new Error("Want item allocation is missing");
    }

    const funding = calculatePurchaseFunding(args.actualAmountCents, reserveContext.availableCents);
    const lowerReserveUseCents =
      funding.reserveUsedCents > selectedAllocation.allocatedCents
        ? funding.reserveUsedCents - selectedAllocation.allocatedCents
        : 0n;
    const lowerItemImpacts = calculateLowerItemImpact(
      allocations.slice(selectedIndex + 1),
      lowerReserveUseCents,
    ).map((impact) => {
      const impactedItem = activeItems.find((activeItem) => activeItem._id === impact.id);

      if (!impactedItem) {
        throw new Error("Impacted Want item is missing");
      }

      return {
        itemId: impact.id,
        name: impactedItem.name,
        lostCents: impact.lostCents,
        allocatedCentsAfter: impact.allocatedCentsAfter,
      };
    });

    return {
      ...funding,
      lowerItemImpacts,
    };
  },
});

export const purchase = mutation({
  args: {
    itemId: v.id("wantItems"),
    actualAmountCents: v.int64(),
    purchaseLocalDate: v.string(),
  },
  returns: purchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    assertPositiveCents(args.actualAmountCents, "Actual amount");

    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const item = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    if (item.status !== "plan_for_it") {
      throw new Error("Only planned Want items can be purchased");
    }

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    const initialTimeZone = getEffectiveTimeZone(household, serverNow);
    const initialCurrentLocalDate = getLocalDateKey(serverNow, initialTimeZone);

    getLocalDayBounds(args.purchaseLocalDate, initialTimeZone);

    if (args.purchaseLocalDate > initialCurrentLocalDate) {
      throw new Error("Purchase date cannot be in the future");
    }

    const closeResult = await closeDaysThrough(ctx, {
      householdId: household._id,
      throughExclusiveTimestamp: serverNow,
      maxDays: CLOSE_DAYS_PER_TRANSACTION,
    });

    if (!closeResult.complete) {
      await scheduleReserveCatchUp(ctx);

      return {
        status: "reserve_syncing" as const,
      };
    }

    const refreshedHousehold = await ctx.db.get(household._id);

    if (!refreshedHousehold) {
      throw new Error("Household disappeared during purchase");
    }

    const reserveContext = await getCurrentReserveSnapshot(ctx, refreshedHousehold, serverNow);

    if (!reserveContext.state) {
      throw new Error("Goal reserve is not active");
    }

    if (args.purchaseLocalDate > reserveContext.localDate) {
      throw new Error("Purchase date cannot be in the future");
    }

    const { startTimestamp: expenseDate } = getLocalDayBounds(
      args.purchaseLocalDate,
      reserveContext.timeZone,
    );
    const funding = calculatePurchaseFunding(args.actualAmountCents, reserveContext.availableCents);

    const expenseId = await ctx.db.insert("expenses", {
      householdId: refreshedHousehold._id,
      name: item.name,
      notes: item.notes,
      amount: centsToLegacyDollars(args.actualAmountCents),
      amountCents: args.actualAmountCents,
      date: expenseDate,
      wantItemId: item._id,
      reserveUsedCents: funding.reserveUsedCents,
    });

    await applyReserveEvent(
      ctx,
      reserveContext.state,
      {
        kind: "purchase",
        localDate: args.purchaseLocalDate,
        reserveUsedCents: funding.reserveUsedCents,
        expenseId,
        wantItemId: item._id,
        actorId: user._id,
      },
      serverNow,
    );

    await applyExpenseDelta(ctx, {
      householdId: refreshedHousehold._id,
      timeZone: reserveContext.timeZone,
      after: {
        date: expenseDate,
        amountCents: args.actualAmountCents,
        reserveUsedCents: funding.reserveUsedCents,
      },
      now: serverNow,
      actorId: user._id,
      sourceExpenseId: expenseId,
    });

    await removeActiveWant(ctx, {
      item,
      nextStatus: "bought",
      actorId: user._id,
      now: serverNow,
    });

    await ctx.db.patch(item._id, {
      purchasedBy: user._id,
      purchasedAt: serverNow,
      expenseId,
    });

    return {
      status: "purchased" as const,
      expenseId,
      ...funding,
    };
  },
});

export const correctPurchase = mutation({
  args: {
    itemId: v.id("wantItems"),
    actualAmountCents: v.int64(),
  },
  returns: correctPurchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    assertPositiveCents(args.actualAmountCents, "Actual amount");

    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const { item, expense } = await requireLinkedPurchase(ctx, args.itemId, user.householdId);
    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    if (household.allowanceCents === undefined) {
      throw new Error("Household money migration is still in progress");
    }

    const reserveState = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .unique();

    if (!reserveState) {
      throw new Error("Goal reserve is not active");
    }

    const oldAmountCents = expense.amountCents;

    if (oldAmountCents === undefined) {
      throw new Error("Linked purchase is missing its cent-valued amount");
    }

    const oldReserveUsedCents = expense.reserveUsedCents ?? 0n;
    const oldBudgetImpactCents = oldAmountCents - oldReserveUsedCents;
    const timeZone = getEffectiveTimeZone(household, serverNow);
    const expenseLocalDate = getLocalDateKey(expense.date, timeZone);
    const currentLocalDate = getLocalDateKey(serverNow, timeZone);

    const [closedDay, currentDayRollup] = await Promise.all([
      ctx.db
        .query("goalReserveDays")
        .withIndex("by_household_and_local_date", (q) =>
          q.eq("householdId", household._id).eq("localDate", expenseLocalDate),
        )
        .unique(),
      ctx.db
        .query("dailyBudgetRollups")
        .withIndex("by_household_and_local_date", (q) =>
          q.eq("householdId", household._id).eq("localDate", currentLocalDate),
        )
        .unique(),
    ]);

    let restoredPositionCents = reserveState.positionCents + oldReserveUsedCents;

    if (closedDay) {
      restoredPositionCents += oldBudgetImpactCents;
    }

    let currentBudgetWithoutPurchaseCents = currentDayRollup?.budgetImpactExpenseCents ?? 0n;

    if (expenseLocalDate === currentLocalDate) {
      currentBudgetWithoutPurchaseCents -= oldBudgetImpactCents;
    }

    if (currentBudgetWithoutPurchaseCents < 0n) {
      throw new Error("Current-day budget rollup is inconsistent");
    }

    const restoredLiveAmounts = projectCurrentReserve(
      restoredPositionCents,
      household.allowanceCents,
      currentBudgetWithoutPurchaseCents,
    );
    const funding = calculatePurchaseFunding(
      args.actualAmountCents,
      restoredLiveAmounts.availableCents,
    );

    const before: ExpenseFacts = {
      date: expense.date,
      amountCents: oldAmountCents,
      reserveUsedCents: oldReserveUsedCents,
    };
    const after: ExpenseFacts = {
      date: expense.date,
      amountCents: args.actualAmountCents,
      reserveUsedCents: funding.reserveUsedCents,
    };

    await ctx.db.patch(expense._id, {
      amount: centsToLegacyDollars(args.actualAmountCents),
      amountCents: args.actualAmountCents,
      reserveUsedCents: funding.reserveUsedCents,
    });

    await applyReserveEvent(
      ctx,
      reserveState,
      {
        kind: "purchase_correction",
        localDate: expenseLocalDate,
        previousReserveUsedCents: oldReserveUsedCents,
        nextReserveUsedCents: funding.reserveUsedCents,
        expenseId: expense._id,
        wantItemId: item._id,
        actorId: user._id,
      },
      serverNow,
    );

    await applyExpenseDelta(ctx, {
      householdId: household._id,
      timeZone,
      before,
      after,
      now: serverNow,
      actorId: user._id,
      sourceExpenseId: expense._id,
    });

    await ctx.db.patch(item._id, {
      updatedBy: user._id,
      updatedAt: serverNow,
    });

    return {
      success: true as const,
      expenseId: expense._id,
      ...funding,
    };
  },
});

export const undoPurchase = mutation({
  args: {
    itemId: v.id("wantItems"),
  },
  returns: undoPurchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const { item, expense } = await requireLinkedPurchase(ctx, args.itemId, user.householdId);
    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    const amountCents = expense.amountCents;

    if (amountCents === undefined) {
      throw new Error("Linked purchase is missing its cent-valued amount");
    }

    const reserveUsedCents = expense.reserveUsedCents ?? 0n;

    await appendActiveWant(ctx, {
      item,
      actorId: user._id,
      now: serverNow,
      queueFullErrorMessage: "Move an item to Considering or Not now before undoing this purchase",
    });

    const reserveState = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .unique();

    if (!reserveState) {
      throw new Error("Goal reserve is not active");
    }

    const timeZone = getEffectiveTimeZone(household, serverNow);
    const purchaseLocalDate = getLocalDateKey(expense.date, timeZone);
    const before: ExpenseFacts = {
      date: expense.date,
      amountCents,
      reserveUsedCents,
    };

    await applyExpenseDelta(ctx, {
      householdId: household._id,
      timeZone,
      before,
      now: serverNow,
      actorId: user._id,
      sourceExpenseId: expense._id,
    });

    const correctedReserveState = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .unique();

    if (!correctedReserveState) {
      throw new Error("Goal reserve disappeared during purchase undo");
    }

    await applyReserveEvent(
      ctx,
      correctedReserveState,
      {
        kind: "purchase_undo",
        localDate: purchaseLocalDate,
        reserveUsedCents,
        expenseId: expense._id,
        wantItemId: item._id,
        actorId: user._id,
      },
      serverNow,
    );

    await ctx.db.delete(expense._id);

    await ctx.db.patch(item._id, {
      purchasedBy: undefined,
      purchasedAt: undefined,
      expenseId: undefined,
    });

    return {
      success: true as const,
    };
  },
});
