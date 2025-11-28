import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// -------------------------
// QUERIES
// -------------------------

export const listMyDepts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).first()

    return await ctx.db.query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", user?.householdId!))
      .collect();
  },
});

export const getTotalPayment = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject)).first()

    const spending = await ctx.db
      .query("debts")
      .withIndex("by_household", (q) => q.eq("householdId", user?.householdId!))
      .filter((q) => q.eq(q.field("isPriority"), true)).collect();

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

