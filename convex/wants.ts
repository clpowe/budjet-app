import { assertPositiveCents } from "../shared/utils/money-cents";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  appendActiveWant,
  loadActiveWantQueue,
  MAX_ACTIVE_WANTS,
  removeActiveWant,
  reorderActiveWants,
} from "./lib/active_want_queue.ts";
import { requireHouseholdDoc, requireHouseholdMember } from "./lib/household_access";
import {
  activateSavings,
  correctPurchase as correctSavingsFundedPurchase,
  getSavingsSnapshot,
  recordPurchase,
  undoPurchase as undoSavingsFundedPurchase,
} from "./lib/savings_account";
import {
  allocateSavings,
  calculateProgressLosses,
  calculatePurchaseFunding,
} from "./lib/want_savings";

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

const progressLossValidator = v.object({
  itemId: v.id("wantItems"),
  name: v.string(),
  lostCents: v.int64(),
  allocatedCentsAfter: v.int64(),
});

const previewPurchaseResultValidator = v.object({
  savingsUsedCents: v.int64(),
  budgetImpactCents: v.int64(),
  progressLosses: v.array(progressLossValidator),
});

const purchaseResultValidator = v.object({
  status: v.literal("ok"),
  expenseId: v.id("expenses"),
  savingsUsedCents: v.int64(),
  budgetImpactCents: v.int64(),
});

const correctPurchaseResultValidator = purchaseResultValidator;

const undoPurchaseResultValidator = v.object({ status: v.literal("ok") });

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

async function requireLinkedPurchase(
  ctx: MutationCtx,
  itemId: Id<"wantItems">,
  householdId: Id<"households">,
): Promise<{
  item: Doc<"wantItems">;
  expense: Doc<"expenses">;
}> {
  const item = await requireHouseholdDoc(
    ctx,
    "wantItems",
    itemId,
    householdId,
    "Want item not found",
  );

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

  const savingsUsedCents = expense.savingsUsedCents ?? expense.reserveUsedCents ?? 0n;

  if (savingsUsedCents < 0n || savingsUsedCents > expense.amountCents) {
    throw new Error("Linked purchase contains invalid savings funding");
  }

  return { item, expense };
}

export const list = query({
  args: {},
  returns: v.object({
    active: v.array(wantItemValidator),
  }),
  handler: async (ctx) => {
    const { household } = await requireHouseholdMember(ctx);
    const householdId = household._id;

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
    const { household } = await requireHouseholdMember(ctx);
    const householdId = household._id;

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
    const { user, household } = await requireHouseholdMember(ctx);

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");

    if (args.targetDate !== undefined && !Number.isFinite(args.targetDate)) {
      throw new Error("Target date must be finite");
    }

    const wantItemId = await ctx.db.insert("wantItems", {
      householdId: household._id,
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
    const { user, household } = await requireHouseholdMember(ctx);

    const wantItem = await requireHouseholdDoc(
      ctx,
      "wantItems",
      args.itemId,
      household._id,
      "Want item not found",
    );

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
    const { user, household } = await requireHouseholdMember(ctx);

    const wantItem = await requireHouseholdDoc(
      ctx,
      "wantItems",
      args.itemId,
      household._id,
      "Want item not found",
    );

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
      // Psavings the existing behavior of refreshing update metadata.
      await ctx.db.patch(wantItem._id, {
        updatedBy: user._id,
        updatedAt: now,
      });
    }

    if (isActivating) {
      await activateSavings(ctx, { household, now });
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
    expectedItemIds: v.array(v.id("wantItems")),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);

    const success = await reorderActiveWants(ctx, {
      householdId: household._id,
      itemIds: args.itemIds,
      expectedItemIds: args.expectedItemIds,
      actorId: user._id,
      now,
    });

    return { success };
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

    const { household } = await requireHouseholdMember(ctx);

    const wantItem = await requireHouseholdDoc(
      ctx,
      "wantItems",
      args.itemId,
      household._id,
      "Want item not found",
    );

    if (wantItem.status !== "plan_for_it") {
      throw new Error("Only planned Want items can be purchased");
    }

    const savingsSnapshot = await getSavingsSnapshot(ctx, household, args.now);
    const activeItems = await loadActiveWantQueue(ctx, household._id);
    const isInActiveQueue = activeItems.some((activeItem) => activeItem._id === wantItem._id);

    if (!isInActiveQueue) {
      throw new Error("Want item is not in the active queue");
    }

    const toSavingsItem = (activeItem: Doc<"wantItems">) => ({
      id: activeItem._id,
      estimatedCostCents: activeItem.estimatedCostCents,
    });
    const funding = calculatePurchaseFunding(
      args.actualAmountCents,
      savingsSnapshot.availableCents,
    );
    const allocationsBefore = allocateSavings(
      savingsSnapshot.availableCents,
      activeItems.map(toSavingsItem),
    );
    const allocationsAfter = allocateSavings(
      savingsSnapshot.availableCents - funding.savingsUsedCents,
      activeItems.filter((activeItem) => activeItem._id !== wantItem._id).map(toSavingsItem),
    );
    const progressLosses = calculateProgressLosses(allocationsBefore, allocationsAfter).map(
      (loss) => {
        const affectedItem = activeItems.find((activeItem) => activeItem._id === loss.id);

        if (!affectedItem) {
          throw new Error("Want item losing progress is missing");
        }

        return {
          itemId: loss.id,
          name: affectedItem.name,
          lostCents: loss.lostCents,
          allocatedCentsAfter: loss.allocatedCentsAfter,
        };
      },
    );

    return {
      ...funding,
      progressLosses,
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

    const { user, household } = await requireHouseholdMember(ctx);
    const wantItem = await requireHouseholdDoc(
      ctx,
      "wantItems",
      args.itemId,
      household._id,
      "Want item not found",
    );

    if (wantItem.status !== "plan_for_it") {
      throw new Error("Only planned Want items can be purchased");
    }

    const result = await recordPurchase(ctx, {
      household,
      want: wantItem,
      amountCents: args.actualAmountCents,
      localDate: args.purchaseLocalDate,
      now: serverNow,
    });

    await removeActiveWant(ctx, {
      item: wantItem,
      nextStatus: "bought",
      actorId: user._id,
      now: serverNow,
    });

    await ctx.db.patch("wantItems", wantItem._id, {
      purchasedBy: user._id,
      purchasedAt: serverNow,
      expenseId: result.expenseId,
    });

    return {
      status: "ok" as const,
      expenseId: result.expenseId,
      savingsUsedCents: result.savingsUsedCents,
      budgetImpactCents: result.budgetImpactCents,
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

    const { user, household } = await requireHouseholdMember(ctx);
    const { item: wantItem, expense } = await requireLinkedPurchase(
      ctx,
      args.itemId,
      household._id,
    );

    const result = await correctSavingsFundedPurchase(ctx, {
      household,
      expense,
      amountCents: args.actualAmountCents,
      now: serverNow,
    });

    await ctx.db.patch("wantItems", wantItem._id, {
      updatedBy: user._id,
      updatedAt: serverNow,
    });

    return {
      status: "ok" as const,
      expenseId: expense._id,
      savingsUsedCents: result.savingsUsedCents,
      budgetImpactCents: result.budgetImpactCents,
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
    const { user, household } = await requireHouseholdMember(ctx);
    const { item: wantItem, expense } = await requireLinkedPurchase(
      ctx,
      args.itemId,
      household._id,
    );

    await undoSavingsFundedPurchase(ctx, {
      household,
      expense,
      now: serverNow,
    });

    // Throws (rolling back the undo) when the active queue is full.
    await appendActiveWant(ctx, {
      item: wantItem,
      actorId: user._id,
      now: serverNow,
      queueFullErrorMessage: "Move an item to Considering or Not now before undoing this purchase",
    });

    await ctx.db.patch("wantItems", wantItem._id, {
      purchasedBy: undefined,
      purchasedAt: undefined,
      expenseId: undefined,
    });

    return { status: "ok" as const };
  },
});
