import { v } from "convex/values";
import { legacyDollarsToCents } from "../shared/utils/money-cents";
import { getEffectiveTimeZone } from "./households";
import { mutation, query } from "./_generated/server";
import { applyExpenseDelta, type ExpenseFacts } from "./lib/daily_budget_rollups.ts";
import { getAuthenticatedUser, getHouseholdId } from "./lib/helpers";
import { getBudgetImpact, getLocalDateKey } from "./lib/want_reserve";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const successValidator = v.object({
  success: v.boolean(),
});

function assertPositiveAmountCents(amountCents: bigint): void {
  if (amountCents <= 0n) {
    throw new Error("Expense amount must be greater than zero");
  }
}

function assertExpenseDateIsNotFuture(
  expenseTimestamp: number,
  now: number,
  timeZone: string,
): void {
  if (getLocalDateKey(expenseTimestamp, timeZone) > getLocalDateKey(now, timeZone)) {
    throw new Error("Expense date cannot be in the future");
  }
}

export function centsToLegacyDollars(amountCents: bigint): number {
  return Number(amountCents) / 100;
}

function toExpenseFacts(expense: {
  amount: number;
  amountCents?: bigint;
  date: number;
  reserveUsedCents?: bigint;
}): ExpenseFacts {
  return {
    date: expense.date,
    amountCents: expense.amountCents ?? legacyDollarsToCents(expense.amount),
    reserveUsedCents: expense.reserveUsedCents ?? 0n,
  };
}

async function getAuthorizedHousehold(ctx: MutationCtx) {
  const user = await getAuthenticatedUser(ctx);

  if (!user.householdId) {
    throw new Error("User is not in a household");
  }

  const household = await ctx.db.get(user.householdId);

  if (!household) {
    throw new Error("Household not found");
  }

  return { household, user };
}

async function getAuthorizedExpense(ctx: MutationCtx, expenseId: Id<"expenses">) {
  const { household, user } = await getAuthorizedHousehold(ctx);
  const expense = await ctx.db.get(expenseId);

  if (!expense || expense.householdId !== household._id) {
    throw new Error("Expense not found");
  }

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
  returns: successValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    assertPositiveAmountCents(args.amountCents);

    const { household, user } = await getAuthorizedHousehold(ctx);
    const timeZone = getEffectiveTimeZone(household, now);
    assertExpenseDateIsNotFuture(args.date, now, timeZone);
    const expenseId = await ctx.db.insert("expenses", {
      name: args.name,
      notes: args.notes,
      amount: centsToLegacyDollars(args.amountCents),
      amountCents: args.amountCents,
      householdId: household._id,
      date: args.date,
    });

    await applyExpenseDelta(ctx, {
      householdId: household._id,
      timeZone,
      after: {
        date: args.date,
        amountCents: args.amountCents,
        reserveUsedCents: 0n,
      },
      now,
      actorId: user._id,
      sourceExpenseId: expenseId,
    });

    return { success: true };
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
  returns: successValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    assertPositiveAmountCents(args.amountCents);

    const { expense, household, user } = await getAuthorizedExpense(ctx, args.expenseId);
    const timeZone = getEffectiveTimeZone(household, now);
    assertExpenseDateIsNotFuture(args.date, now, timeZone);
    const before = toExpenseFacts(expense);
    const after: ExpenseFacts = {
      date: args.date,
      amountCents: args.amountCents,
      reserveUsedCents: 0n,
    };

    await ctx.db.patch(expense._id, {
      name: args.name,
      notes: args.notes,
      amount: centsToLegacyDollars(args.amountCents),
      amountCents: args.amountCents,
      date: args.date,
    });

    await applyExpenseDelta(ctx, {
      householdId: household._id,
      timeZone,
      before,
      after,
      now,
      actorId: user._id,
      sourceExpenseId: expense._id,
    });

    return { success: true };
  },
});

export const deleteExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  returns: successValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const { expense, household, user } = await getAuthorizedExpense(ctx, args.expenseId);

    await applyExpenseDelta(ctx, {
      householdId: household._id,
      timeZone: getEffectiveTimeZone(household, now),
      before: toExpenseFacts(expense),
      now,
      actorId: user._id,
      sourceExpenseId: expense._id,
    });

    await ctx.db.delete(expense._id);

    return { success: true };
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
