import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// -------------------------
// QUERIES
// -------------------------

export const listDepts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("debts").collect();
  },
});

export const getTotalPayment = query({
  args: {},
  handler: async (ctx) => {
    const spending = await ctx.db
      .query("debts")
      .filter((q) => q.eq(q.field("isPriority"), true))
      .collect();

    return spending.reduce((acc, curr) => acc + curr.payment, 0);
  },
});

// -------------------------
// MUTATIONS
// -------------------------

export const updateDeptPriority = mutation({
  args: {
    id: v.id("snowball"),
    value: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isPriority: args.value });
  },
});
