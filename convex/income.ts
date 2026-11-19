import { v } from "convex/values";

import { getLocalDayBounds } from "../shared/utils/local-date.ts";
import { query, mutation } from "./_generated/server";
import { getEffectiveTimeZone } from "./households";
import {
  findHouseholdMember,
  requireHouseholdDoc,
  requireHouseholdMember,
} from "./lib/household_access";

// -------------------------
// QUERIES
// -------------------------

export const listIncome = query({
  args: {},
  handler: async (ctx) => {
    const member = await findHouseholdMember(ctx);

    if (!member) {
      return [];
    }

    return await ctx.db
      .query("income")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", member.household._id))
      .collect();
  },
});

export const getMyIncomeTotal = query({
  args: {},
  returns: v.int64(),
  handler: async (ctx) => {
    const member = await findHouseholdMember(ctx);

    if (!member) {
      return 0n;
    }

    let totalCents = 0n;

    for await (const income of ctx.db
      .query("income")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", member.household._id))) {
      totalCents += income.amountCents;
    }

    return totalCents;
  },
});

// -------------------------
// MUTATIONS
// -------------------------

export const addIncome = mutation({
  args: {
    source: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    localDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);

    // Validation only: throws on a malformed date or an invalid time zone.
    getLocalDayBounds(args.localDate, getEffectiveTimeZone(household, Date.now()));

    return await ctx.db.insert("income", {
      source: args.source,
      notes: args.notes,
      householdId: household._id,
      amountCents: args.amountCents,
      localDate: args.localDate,
    });
  },
});

export const updateIncome = mutation({
  args: {
    incomeId: v.id("income"),
    source: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    localDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    await requireHouseholdDoc(ctx, "income", args.incomeId, household._id, "Income not found");

    if (args.localDate !== undefined) {
      getLocalDayBounds(args.localDate, getEffectiveTimeZone(household, Date.now()));
    }

    await ctx.db.patch("income", args.incomeId, {
      source: args.source,
      notes: args.notes,
      amountCents: args.amountCents,
      ...(args.localDate !== undefined ? { localDate: args.localDate } : {}),
    });

    return { success: true };
  },
});

export const deleteIncome = mutation({
  args: {
    incomeId: v.id("income"),
  },
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    await requireHouseholdDoc(ctx, "income", args.incomeId, household._id, "Income not found");

    await ctx.db.delete("income", args.incomeId);

    return { success: true };
  },
});
