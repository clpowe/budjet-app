import { v } from "convex/values";

import { query, mutation } from "./_generated/server";
import {
  findHouseholdMember,
  requireHouseholdDoc,
  requireHouseholdMember,
} from "./lib/household_access";

// -------------------------
// QUERIES
// -------------------------

export const listWindfall = query({
  args: {},
  handler: async (ctx) => {
    const member = await findHouseholdMember(ctx);

    if (!member) {
      return [];
    }

    return await ctx.db
      .query("windfall")
      .withIndex("by_household_date", (q) => q.eq("householdId", member.household._id))
      .collect();
  },
});

export const getMyWindfallTotal = query({
  args: {},
  handler: async (ctx) => {
    const member = await findHouseholdMember(ctx);

    if (!member) {
      return 0;
    }

    const windfalls = await ctx.db
      .query("windfall")
      .withIndex("by_household_date", (q) => q.eq("householdId", member.household._id))
      .collect();

    return windfalls.reduce((acc, curr) => acc + curr.amount, 0);
  },
});

// -------------------------
// MUTATIONS
// -------------------------

export const addWindfallTransaction = mutation({
  args: {
    source: v.string(),
    notes: v.string(),
    amount: v.number(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);

    return await ctx.db.insert("windfall", {
      source: args.source,
      notes: args.notes,
      householdId: household._id,
      amount: args.amount,
      date: args.date,
    });
  },
});

export const updateWindfall = mutation({
  args: {
    windfallId: v.id("windfall"),
    source: v.string(),
    notes: v.string(),
    amount: v.number(),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    await requireHouseholdDoc(
      ctx,
      "windfall",
      args.windfallId,
      household._id,
      "Windfall not found",
    );

    await ctx.db.patch("windfall", args.windfallId, {
      source: args.source,
      notes: args.notes,
      amount: args.amount,
      ...(args.date !== undefined ? { date: args.date } : {}),
    });

    return { success: true };
  },
});

export const deleteWindfall = mutation({
  args: {
    windfallId: v.id("windfall"),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    await requireHouseholdDoc(
      ctx,
      "windfall",
      args.windfallId,
      household._id,
      "Windfall not found",
    );

    await ctx.db.delete("windfall", args.windfallId);

    return { success: true };
  },
});
