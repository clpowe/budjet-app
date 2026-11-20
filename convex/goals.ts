import { assertPositiveCents } from "../shared/utils/money-cents";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  appendActiveGoal,
  MAX_ACTIVE_GOALS,
  removeActiveGoal,
  reorderActiveGoals,
} from "./lib/active_goal_queue.ts";
import schema from "./schema";
import { requireHouseholdDoc, requireHouseholdMember } from "./lib/household_access";
import {
  activateSavings,
  correctPurchase as correctSavingsFundedPurchase,
  recordPurchase,
  undoPurchase as undoSavingsFundedPurchase,
} from "./lib/savings_account";

export const INACTIVE_GOALS_PAGE_SIZE = 25;

const goalFields = schema.tables.goals.validator.fields;

const goalPriorityValidator = goalFields.priority;
const goalStatusValidator = goalFields.status;

const inactiveGoalStatusValidator = v.union(
  v.literal("idea"),
  v.literal("on_hold"),
  v.literal("purchased"),
);

const goalValidator = schema.tables.goals.validator.extend({
  _id: v.id("goals"),
  _creationTime: v.number(),
});

const changeStatusResultValidator = v.object({
  kind: v.literal("updated"),
  item: goalValidator,
});

const purchaseResultValidator = v.object({
  status: v.literal("ok"),
  expenseId: v.id("expenses"),
  fromSavingsCents: v.int64(),
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
  if (numItems !== INACTIVE_GOALS_PAGE_SIZE) {
    throw new Error(`Inactive Want pages must contain ${INACTIVE_GOALS_PAGE_SIZE} items`);
  }
}

async function requireLinkedPurchase(
  ctx: MutationCtx,
  goalId: Id<"goals">,
  householdId: Id<"households">,
): Promise<{
  item: Doc<"goals">;
  expense: Doc<"expenses">;
}> {
  const item = await requireHouseholdDoc(ctx, "goals", goalId, householdId, "Want item not found");

  if (item.status !== "purchased" || !item.expenseId) {
    throw new Error("Want item does not have a linked purchase");
  }

  const expense = await ctx.db.get(item.expenseId);

  if (!expense || expense.householdId !== householdId || expense.goalId !== item._id) {
    throw new Error("Linked purchase expense not found");
  }

  if (expense.amountCents === undefined) {
    throw new Error("Linked purchase is missing its cent-valued amount");
  }

  const fromSavingsCents = expense.fromSavingsCents ?? 0n;

  if (fromSavingsCents < 0n || fromSavingsCents > expense.amountCents) {
    throw new Error("Linked purchase contains invalid savings funding");
  }

  return { item, expense };
}

export const list = query({
  args: {},
  returns: v.object({
    active: v.array(goalValidator),
  }),
  handler: async (ctx) => {
    const { household } = await requireHouseholdMember(ctx);
    const householdId = household._id;

    const active = await ctx.db
      .query("goals")
      .withIndex("by_household_and_status_and_order", (q) =>
        q.eq("householdId", householdId).eq("status", "saving"),
      )
      .order("asc")
      .take(MAX_ACTIVE_GOALS + 1);

    if (active.length > MAX_ACTIVE_GOALS) {
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
    status: inactiveGoalStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(goalValidator),
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    const householdId = household._id;

    assertInactivePageSize(args.paginationOpts.numItems);

    return await ctx.db
      .query("goals")
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
    priority: goalPriorityValidator,
    targetDate: v.optional(v.number()),
    notes: v.string(),
  },
  returns: goalValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");

    if (args.targetDate !== undefined && !Number.isFinite(args.targetDate)) {
      throw new Error("Target date must be finite");
    }

    const goalId = await ctx.db.insert("goals", {
      householdId: household._id,
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      ...(args.targetDate !== undefined ? { targetDate: args.targetDate } : {}),
      notes: normalizeNotes(args.notes),
      status: "idea",
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const goal = await ctx.db.get(goalId);

    if (!goal) {
      throw new Error("Failed to create Want item");
    }

    return goal;
  },
});

export const update = mutation({
  args: {
    goalId: v.id("goals"),
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: goalPriorityValidator,
    targetDate: v.union(v.number(), v.null()),
    notes: v.string(),
  },
  returns: goalValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);

    const goal = await requireHouseholdDoc(
      ctx,
      "goals",
      args.goalId,
      household._id,
      "Want item not found",
    );

    if (goal.status === "purchased") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");
    assertFiniteTargetDate(args.targetDate);

    await ctx.db.patch(goal._id, {
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      targetDate: args.targetDate === null ? undefined : args.targetDate,
      notes: normalizeNotes(args.notes),
      updatedBy: user._id,
      updatedAt: now,
    });

    const updatedWantItem = await ctx.db.get(goal._id);

    if (!updatedWantItem) {
      throw new Error("Want item disappeared during update");
    }

    return updatedWantItem;
  },
});

export const changeStatus = mutation({
  args: {
    goalId: v.id("goals"),
    status: goalStatusValidator,
  },
  returns: changeStatusResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);

    const goal = await requireHouseholdDoc(
      ctx,
      "goals",
      args.goalId,
      household._id,
      "Want item not found",
    );

    if (goal.status === "purchased" || args.status === "purchased") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    const isActivating = args.status === "saving" && goal.status !== "saving";

    if (isActivating) {
      await appendActiveGoal(ctx, {
        item: goal,
        actorId: user._id,
        now,
        queueFullErrorMessage:
          "Move an item to Considering or Not now before planning another purchase",
      });
    } else if (goal.status === "saving" && args.status !== "saving") {
      await removeActiveGoal(ctx, {
        item: goal,
        nextStatus: args.status,
        actorId: user._id,
        now,
      });
    } else if (goal.status !== args.status) {
      // This is an inactive-to-inactive transition.
      await ctx.db.patch(goal._id, {
        status: args.status,
        order: undefined,
        updatedBy: user._id,
        updatedAt: now,
      });
    } else {
      // Psavings the existing behavior of refreshing update metadata.
      await ctx.db.patch(goal._id, {
        updatedBy: user._id,
        updatedAt: now,
      });
    }

    if (isActivating) {
      await activateSavings(ctx, { household, now });
    }

    const updatedWantItem = await ctx.db.get(goal._id);

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
    goalIds: v.array(v.id("goals")),
    expectedGoalIds: v.array(v.id("goals")),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);

    const success = await reorderActiveGoals(ctx, {
      householdId: household._id,
      goalIds: args.goalIds,
      expectedGoalIds: args.expectedGoalIds,
      actorId: user._id,
      now,
    });

    return { success };
  },
});

export const purchase = mutation({
  args: {
    goalId: v.id("goals"),
    actualAmountCents: v.int64(),
    purchaseLocalDate: v.string(),
  },
  returns: purchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    assertPositiveCents(args.actualAmountCents, "Actual amount");

    const { user, household } = await requireHouseholdMember(ctx);
    const goal = await requireHouseholdDoc(
      ctx,
      "goals",
      args.goalId,
      household._id,
      "Want item not found",
    );

    if (goal.status !== "saving") {
      throw new Error("Only planned Want items can be purchased");
    }

    const result = await recordPurchase(ctx, {
      household,
      want: goal,
      amountCents: args.actualAmountCents,
      localDate: args.purchaseLocalDate,
      now: serverNow,
    });

    await removeActiveGoal(ctx, {
      item: goal,
      nextStatus: "purchased",
      actorId: user._id,
      now: serverNow,
    });

    await ctx.db.patch("goals", goal._id, {
      purchasedBy: user._id,
      purchasedAt: serverNow,
      expenseId: result.expenseId,
    });

    return {
      status: "ok" as const,
      expenseId: result.expenseId,
      fromSavingsCents: result.fromSavingsCents,
      budgetImpactCents: result.budgetImpactCents,
    };
  },
});

export const correctPurchase = mutation({
  args: {
    goalId: v.id("goals"),
    actualAmountCents: v.int64(),
  },
  returns: correctPurchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    assertPositiveCents(args.actualAmountCents, "Actual amount");

    const { user, household } = await requireHouseholdMember(ctx);
    const { item: goal, expense } = await requireLinkedPurchase(ctx, args.goalId, household._id);

    const result = await correctSavingsFundedPurchase(ctx, {
      household,
      expense,
      amountCents: args.actualAmountCents,
      now: serverNow,
    });

    await ctx.db.patch("goals", goal._id, {
      updatedBy: user._id,
      updatedAt: serverNow,
    });

    return {
      status: "ok" as const,
      expenseId: expense._id,
      fromSavingsCents: result.fromSavingsCents,
      budgetImpactCents: result.budgetImpactCents,
    };
  },
});

export const undoPurchase = mutation({
  args: {
    goalId: v.id("goals"),
  },
  returns: undoPurchaseResultValidator,
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    const { user, household } = await requireHouseholdMember(ctx);
    const { item: goal, expense } = await requireLinkedPurchase(ctx, args.goalId, household._id);

    await undoSavingsFundedPurchase(ctx, {
      household,
      expense,
      now: serverNow,
    });

    // Throws (rolling back the undo) when the active queue is full.
    await appendActiveGoal(ctx, {
      item: goal,
      actorId: user._id,
      now: serverNow,
      queueFullErrorMessage: "Move an item to Considering or Not now before undoing this purchase",
    });

    await ctx.db.patch("goals", goal._id, {
      purchasedBy: undefined,
      purchasedAt: undefined,
      expenseId: undefined,
    });

    return { status: "ok" as const };
  },
});
