import { mutation, query } from "./_generated/server";
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

export const addExtraDollars = mutation({
  args: {
    name: v.string(),
    notes: v.string(),
    value: v.number(),
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const trans = await ctx.db.insert("extraDollars", {
      name: args.name,
      notes: args.notes,
      householdId: args.householdId,
      value: args.value,
    });

    return trans;
  }
})
