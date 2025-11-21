import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// -------------------------
// QUERIES
// -------------------------

export const listWindfall = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("windfall").collect();
  },
});

export const getMyWindfallTotal = query({
  args: {},
  handler: async (ctx) => {
    const spending = await ctx.db.query("windfall").collect();

    return spending.reduce((acc, curr) => acc + curr.amount, 0);
  },
});

export const addWindfallTransaction = mutation({
  args: {
    source: v.string(),
    notes: v.string(),
    amount: v.number(),
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const windfallTransaction = await ctx.db.insert("windfall", {
      source: args.source,
      notes: args.notes,
      householdId: args.householdId,
      amount: args.amount,
    });

    return windfallTransaction;
  }
})

// -------------------------
// MUTATIONS
// -------------------------

export const updateWindfall = mutation({
  args: {
    windfallId: v.id("windfall"),
    source: v.string(),
    notes: v.string(),
    amount: v.number(),
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const windfall = await ctx.db.get(args.windfallId);
    if (!windfall) throw new Error("Windfall not found")


    await ctx.db.patch(args.windfallId, {
      source: args.source,
      notes: args.notes,
      amount: args.amount,
      householdId: args.householdId,
    });

    return { success: true }
  }
})

export const deleteWindfall = mutation({
  args: {
    windfallId: v.id("windfall"),
  },
  handler: async (ctx, args) => {
    const windfall = await ctx.db.get(args.windfallId);
    if (!windfall) throw new Error("Windfall not found")

    await ctx.db.delete(args.windfallId);

    return { success: true };
  }
})
