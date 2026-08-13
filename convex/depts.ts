import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getHouseholdId } from "./lib/helpers";

const MAX_REORDERABLE_DEBTS = 500;

type DebtPayment = {
  isPriority: boolean;
  payment: number;
};

export function getSnowballTotal(debts: DebtPayment[]) {
  return debts.reduce((total, debt) => total + debt.payment, 0);
}

export function getDebtOrderUpdates(currentIds: Id<"debts">[], orderedIds: Id<"debts">[]) {
  if (currentIds.length !== orderedIds.length) {
    throw new Error("Debt list changed while reordering");
  }

  const currentIdSet = new Set(currentIds);
  const orderedIdSet = new Set(orderedIds);

  if (orderedIdSet.size !== orderedIds.length) {
    throw new Error("Debt order contains duplicate items");
  }

  if (orderedIds.some((id) => !currentIdSet.has(id))) {
    throw new Error("Debt order contains an invalid item");
  }

  return orderedIds.map((id, order) => ({ id, order }));
}

async function requireHouseholdDebt(ctx: MutationCtx, id: Id<"debts">): Promise<Doc<"debts">> {
  const householdId = await getHouseholdId(ctx);
  const debt = await ctx.db.get(id);

  if (!debt || debt.householdId !== householdId) {
    throw new Error("Debt not found");
  }

  return debt;
}

// -------------------------
// QUERIES
// -------------------------

export const listMyDepts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const householdId = await getHouseholdId(ctx);

    return await ctx.db
      .query("debts")
      .withIndex("by_household_order", (q) => q.eq("householdId", householdId))
      .collect();
  },
});

export const getTotalPayment = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const householdId = await getHouseholdId(ctx);

    const debts = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();

    return getSnowballTotal(debts);
  },
});

// -------------------------
// MUTATIONS
// -------------------------

export const updateDebt = mutation({
  args: {
    id: v.id("debts"),
    isPriority: v.optional(v.boolean()),
    creditor: v.optional(v.string()),
    payment: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await requireHouseholdDebt(ctx, id);

    // Build a partial update with only defined fields
    const update: {
      isPriority?: boolean;
      creditor?: string;
      payment?: number;
    } = {};
    if (fields.isPriority !== undefined) update.isPriority = fields.isPriority;
    if (fields.creditor !== undefined) update.creditor = fields.creditor;
    if (fields.payment !== undefined) update.payment = fields.payment;

    await ctx.db.patch(id, update);
  },
});

export const createDebt = mutation({
  args: {
    creditor: v.string(),
    payment: v.number(),
    isPriority: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const householdId = await getHouseholdId(ctx);

    const existingDebts = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();

    const maxOrder = existingDebts.reduce((max, debt) => Math.max(max, debt.order ?? -1), -1);

    const newDebt = await ctx.db.insert("debts", {
      creditor: args.creditor,
      payment: args.payment,
      isPriority: args.isPriority,
      householdId: householdId,
      order: maxOrder + 1,
    });

    if (!newDebt) {
      throw new Error("Failed to create expense");
    }

    return {
      success: true,
    };
  },
});

export const deleteDepts = mutation({
  args: {
    id: v.id("debts"),
  },
  handler: async (ctx, args) => {
    await requireHouseholdDebt(ctx, args.id);

    await ctx.db.delete(args.id);

    return { success: true };
  },
});

export const reorderDebts = mutation({
  args: {
    orderedIds: v.array(v.id("debts")),
  },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const currentDebts = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .take(MAX_REORDERABLE_DEBTS + 1);

    if (currentDebts.length > MAX_REORDERABLE_DEBTS) {
      throw new Error("Too many debts to reorder at once");
    }

    const updates = getDebtOrderUpdates(
      currentDebts.map((debt) => debt._id),
      args.orderedIds,
    );
    const debtsById = new Map(currentDebts.map((debt) => [debt._id, debt]));

    for (const update of updates) {
      if (debtsById.get(update.id)?.order !== update.order) {
        await ctx.db.patch(update.id, { order: update.order });
      }
    }

    return { success: true as const };
  },
});
