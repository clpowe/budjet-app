import { query } from "./_generated/server";
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
