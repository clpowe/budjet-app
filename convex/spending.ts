import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getSpending = query({
  args: {
    month: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("spending")
      .filter((q) => q.eq(q.field("month"), args.month))
      .collect();
  },
});

export const getTotal = query({
  args: {
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity()

    const spending = await ctx.db
      .query("spending")
      .filter((q) => q.eq(q.field("month"), args.month))
      .collect();

    return spending.reduce((acc, curr) => acc + curr.value, 0);
  },
});

export const getToday = query({
  args: {
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date();

    // local midnight (start of the day)
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    // next local midnight (end of the day)
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    ).getTime();

    const spending = await ctx.db
      .query("spending")
      .filter((q) =>
        q.and(
          q.eq(q.field("month"), args.month),
          q.gte(q.field("date"), startOfDay),
          q.lt(q.field("date"), endOfDay),
        ),
      )
      .collect();

    return spending.reduce((acc, curr) => acc + curr.value, 0);
  },
});

export const getCurrentPosition = query({
  args: {
    offset: v.number(),
    allowance: v.number(),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const days = daysElapsedInMonth(args.offset ?? 0);
    const spending = await ctx.db
      .query("spending")
      .filter((q) => q.eq(q.field("month"), args.month))
      .collect();

    const total = spending.reduce((acc, curr) => acc + curr.value, 0);

    return days * args.allowance - total;
  },
});

function daysElapsedInMonth(offset = 0): number {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth() + offset,
    now.getDate(),
  );

  // If target month is in the future relative to today, clamp to last day of that month
  const isCurrentMonth = offset === 0;
  if (isCurrentMonth) return now.getDate();

  // If offset is negative (past months), return total days in that month
  const daysInMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  return daysInMonth;
}

export const addSpending = mutation({
  args: {
    name: v.string(),
    notes: v.string(),
    value: v.number(),
    householdId: v.id("households"),
    month: v.string(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const newSpending = await ctx.db.insert("spending", {
      name: args.name,
      notes: args.notes,
      householdId: args.householdId,
      value: args.value,
      month: args.month,
      date: args.date,
    });

    return newSpending;
  },
});
