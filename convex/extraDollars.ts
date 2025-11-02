import { query } from "./_generated/server";
import { v } from "convex/values";

export const getExtraDollars = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("extraDollars").collect();
  },
});

export const getTotal = query({
  args: {},
  handler: async (ctx) => {
    const spending = await ctx.db.query("extraDollars").collect();

    return spending.reduce((acc, curr) => acc + curr.value, 0);
  },
});
