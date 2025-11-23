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

export const updateDeptPriority = mutation({
  args: {
    id: v.id("debts"),
    value: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isPriority: args.value });
  },
});

export const updateDept = mutation({
  args: {
    id: v.id("debts"),
    creditor: v.string(),
    priority: v.boolean(),
    payment: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await ctx.db.patch(args.id, {
      creditor: args.creditor,
      payment: args.payment,
      isPriority: args.priority,
    });

    return { success: true }
  },
})
