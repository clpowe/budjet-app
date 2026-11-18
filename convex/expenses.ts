import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getHouseholdId } from "./lib/helpers";
import { requireHouseholdDoc, requireHouseholdMember } from "./lib/household_access";
import { addExpense, editExpense, removeExpense, type ReserveResult } from "./lib/reserve_account";
import { getBudgetImpact } from "./lib/want_reserve";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * `success: false` means the reserve was still catching up on closed days; the
 * expense was not written and the client should retry shortly.
 */
const expenseWriteResultValidator = v.union(
  v.object({ success: v.literal(true) }),
  v.object({ success: v.literal(false), reason: v.literal("reserve_syncing") }),
);

function toWriteResult(result: ReserveResult) {
  return result.status === "ok"
    ? { success: true as const }
    : { success: false as const, reason: "reserve_syncing" as const };
}

async function getAuthorizedExpense(ctx: MutationCtx, expenseId: Id<"expenses">) {
  const { household, user } = await requireHouseholdMember(ctx);
  const expense = await requireHouseholdDoc(
    ctx,
    "expenses",
    expenseId,
    household._id,
    "Expense not found",
  );

  if (expense.wantItemId) {
    throw new Error("Want purchases must be managed from the wants flow");
  }

  return { expense, household, user };
}

export const listMyExpenses = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);

    return await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) =>
        q.eq("householdId", householdId).gte("date", args.from).lt("date", args.to),
      )
      .order("desc")
      .collect();
  },
});

export const getMyTotal = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) =>
        q.eq("householdId", householdId).gte("date", args.from).lt("date", args.to),
      )
      .collect();

    return expenses.reduce((acc, curr) => acc + curr.amount, 0);
  },
});

export const getMyCurrentPosition = query({
  args: {
    allowance: v.number(),
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);
    const now = Date.now();
    const effectiveEnd = Math.min(now, args.to);

    if (effectiveEnd < args.from) {
      return 0;
    }

    const daysElapsed = Math.ceil((effectiveEnd - args.from) / (24 * 60 * 60 * 1_000));
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) =>
        q.eq("householdId", householdId).gte("date", args.from).lt("date", args.to),
      )
      .collect();
    const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

    return daysElapsed * args.allowance - totalSpent;
  },
});

export const createExpense = mutation({
  args: {
    name: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    date: v.number(),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    const result = await addExpense(ctx, {
      household,
      fields: args,
      now: Date.now(),
    });

    return toWriteResult(result);
  },
});

export const updateExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    name: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    date: v.number(),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { expenseId, ...fields } = args;
    const { expense, household } = await getAuthorizedExpense(ctx, expenseId);
    const result = await editExpense(ctx, {
      household,
      expense,
      fields,
      now: Date.now(),
    });

    return toWriteResult(result);
  },
});

export const deleteExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { expense, household } = await getAuthorizedExpense(ctx, args.expenseId);
    const result = await removeExpense(ctx, {
      household,
      expense,
      now: Date.now(),
    });

    return toWriteResult(result);
  },
});

export const listMonthlyTransactions = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) =>
        q.eq("householdId", householdId).gte("date", args.from).lt("date", args.to),
      )
      .collect();
    const windfalls = await ctx.db
      .query("windfall")
      .withIndex("by_household_date", (q) =>
        q.eq("householdId", householdId).gte("date", args.from).lt("date", args.to),
      )
      .collect();

    return [
      ...expenses.map((expense) => {
        if (expense.amountCents === undefined) {
          throw new Error("Household money migration is still in progress");
        }

        const reserveUsedCents = expense.reserveUsedCents ?? 0n;

        return {
          ...expense,
          reserveUsedCents,
          budgetImpactCents: getBudgetImpact(expense.amountCents, reserveUsedCents),
          isWantPurchase: expense.wantItemId !== undefined,
          type: "expense" as const,
        };
      }),
      ...windfalls.map((windfall) => ({
        ...windfall,
        name: windfall.source,
        type: "windfall" as const,
      })),
    ].sort((left, right) => (right.date ?? 0) - (left.date ?? 0));
  },
});
