import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getHouseholdId } from "./lib/helpers";

// -------------------------
// QUERIES
// -------------------------

export const listMyDepts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const householdId = await getHouseholdId(ctx, identity);

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
    const householdId = await getHouseholdId(ctx, identity);

    const spending = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .filter((q) => q.eq(q.field("isPriority"), true))
      .collect();

    return spending.reduce((acc, curr) => acc + curr.payment, 0);
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

    // Build a partial update with only defined fields
    const update: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }

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

    const householdId = await getHouseholdId(ctx, identity);

    const existingDebts = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();

    const maxOrder = existingDebts.reduce(
      (max, debt) => (debt.order > max ? debt.order : max),
      0,
    );

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
    const debt = await ctx.db.get(args.id);
    if (!debt) throw new Error("Debt not found");

    await ctx.db.delete(args.id);

    return { success: true };
  },
});

export const reorderDebts = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("debts"),
        order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await Promise.all(
      args.updates.map((update) =>
        ctx.db.patch(update.id, { order: update.order }),
      ),
    );

    return { success: true };
  },
});
