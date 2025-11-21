import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// -------------------------
// QUERIES
// -------------------------

export const listMyExpenses = query({
  args: {
    householdId: v.optional(v.id("households")),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated and in the household (omitted for brevity)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Use the combined index for fast range lookup
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId!))
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), args.from),
          q.lt(q.field("date"), args.to)
        )
      )
      .collect();

    // Sort Descending (newest first) usually preferred for UI
    return expenses.sort((a, b) => b.date - a.date);
  },
});

export const getMyTotal = query({
  args: {
    householdId: v.id("households"),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    // Ensure user is authenticated and in the household (omitted for brevity)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), args.from),
          q.lt(q.field("date"), args.to)
        )
      )
      .collect();

    return expenses.reduce((acc, curr) => acc + curr.amount, 0);
  },
});

// Cleaned up "Current Position" logic
export const getMyCurrentPosition = query({
  args: {
    householdId: v.id("households"),
    allowance: v.number(),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");


    const now = Date.now();

    // 1. Calculate how many days have passed within the requested window
    // If the window is in the past, count all days. If "now" is inside the window, count up to now.
    const effectiveEnd = Math.min(now, args.to);
    const effectiveStart = args.from;

    // If we haven't started this month yet, result is 0
    if (effectiveEnd < effectiveStart) return 0;

    const msElapsed = effectiveEnd - effectiveStart;
    const daysElapsed = Math.ceil(msElapsed / (1000 * 60 * 60 * 24));

    // 2. Get actual spending
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), args.from),
          q.lt(q.field("date"), args.to)
        )
      )
      .collect();

    const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

    // 3. Math: (Days Passed * Daily Budget) - Actual Spending
    return (daysElapsed * args.allowance) - totalSpent;
  },
});


// -------------------------
// MUTATIONS
// -------------------------

export const createExpense = mutation({
  args: {
    name: v.string(),
    notes: v.string(),
    amount: v.number(),
    householdId: v.id("households"),
    date: v.number(),   // UTC Timestamp
  },
  handler: async (ctx, args) => {
    const newExpense = await ctx.db.insert("expenses", {
      name: args.name,
      notes: args.notes,
      householdId: args.householdId,
      amount: args.amount,
      date: args.date,
    });
    return newExpense;
  },
});

export const updateExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    name: v.string(),
    notes: v.string(),
    amount: v.number(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found")

    await ctx.db.patch(args.expenseId, {
      name: args.name,
      notes: args.notes,
      amount: args.amount,
      date: args.date,
    });

    return { success: true }
  },
});

export const deleteExpense = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found")

    await ctx.db.delete(args.expenseId);

    return { success: true }
  },
});
