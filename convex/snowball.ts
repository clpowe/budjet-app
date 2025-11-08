import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getSnowball = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("snowball").collect();
  },
});

export const getTotal = query({
  args: {
    month: v.string(),
  },
  handler: async (ctx) => {
    const spending = await ctx.db
      .query("snowball")
      .filter((q) => q.eq(q.field("snowball"), true))
      .collect();

    return spending.reduce((acc, curr) => acc + curr.amount, 0);
  },
});

export const toggleSnowball = mutation({
  args: {
    id: v.id("snowball"),
    value: v.boolean(),
  },
  handler: async (ctx, { id, value }) => {
    await ctx.db.patch(id, { snowball: value });
  },
});
