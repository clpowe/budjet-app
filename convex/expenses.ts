import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getEffectiveTimeZone } from "./households";
import { toExpenseFacts } from "./lib/daily_budget_totals";
import { getHouseholdId } from "./lib/helpers";
import { requireHouseholdDoc, requireHouseholdMember } from "./lib/household_access";
import { addExpense, editExpense, removeExpense } from "./lib/savings_account";
import {
  getLocalDateKey,
  getLocalMonthPeriod,
  getNextLocalDate,
  getNextMonthStart,
} from "../shared/utils/local-date.ts";
import { budgetImpact } from "../shared/utils/savings";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * `success: false` means savings were still catching up on closed days; the
 * expense was not written and the client should retry shortly.
 */
const expenseWriteResultValidator = v.object({ success: v.literal(true) });

const expenseDoc = schema.tables.expenses.validator.extend({
  _id: v.id("expenses"),
  _creationTime: v.number(),
});

const monthlyTransaction = v.union(
  expenseDoc.extend({
    type: v.literal("expense"),
    fromSavingsCents: v.int64(),
    budgetImpactCents: v.int64(),
    isWantPurchase: v.boolean(),
  }),
  schema.tables.income.validator.extend({
    _id: v.id("income"),
    _creationTime: v.number(),
    type: v.literal("income"),
    name: v.string(),
  }),
);

async function readExpensesByLocalDate(
  ctx: QueryCtx,
  householdId: Id<"households">,
  startLocalDate: string,
  endExclusiveLocalDate: string,
) {
  return await ctx.db
    .query("expenses")
    .withIndex("by_household_and_local_date", (q) =>
      q
        .eq("householdId", householdId)
        .gte("localDate", startLocalDate)
        .lt("localDate", endExclusiveLocalDate),
    )
    .order("desc")
    .collect();
}

export const listDailyExpenses = query({
  args: { asOfTimestamp: v.number() },
  returns: v.array(expenseDoc),
  handler: async (ctx, { asOfTimestamp }) => {
    const { household } = await requireHouseholdMember(ctx);
    const timeZone = getEffectiveTimeZone(household, asOfTimestamp);
    const localDate = getLocalDateKey(asOfTimestamp, timeZone);
    return await readExpensesByLocalDate(
      ctx,
      household._id,
      localDate,
      getNextLocalDate(localDate, timeZone),
    );
  },
});

async function getAuthorizedExpense(ctx: MutationCtx, expenseId: Id<"expenses">) {
  const { household, user } = await requireHouseholdMember(ctx);
  const expense = await requireHouseholdDoc(
    ctx,
    "expenses",
    expenseId,
    household._id,
    "Expense not found",
  );

  if (expense.goalId) {
    throw new Error("Want purchases must be managed from the wants flow");
  }

  return { expense, household, user };
}

export const listMyExpenses = query({
  args: {
    startLocalDate: v.string(),
    endExclusiveLocalDate: v.string(),
  },
  returns: v.array(expenseDoc),
  handler: async (ctx, args) => {
    const householdId = await getHouseholdId(ctx);

    return await readExpensesByLocalDate(
      ctx,
      householdId,
      args.startLocalDate,
      args.endExclusiveLocalDate,
    );
  },
});

export const createExpense = mutation({
  args: {
    name: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    localDate: v.string(),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { household } = await requireHouseholdMember(ctx);
    await addExpense(ctx, {
      household,
      fields: args,
      now: Date.now(),
    });

    return { success: true as const };
  },
});

export const updateExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    name: v.string(),
    notes: v.string(),
    amountCents: v.int64(),
    localDate: v.optional(v.string()),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { expenseId, ...fields } = args;
    const { expense, household } = await getAuthorizedExpense(ctx, expenseId);
    await editExpense(ctx, {
      household,
      expense,
      fields,
      now: Date.now(),
    });

    return { success: true as const };
  },
});

export const deleteExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  returns: expenseWriteResultValidator,
  handler: async (ctx, args) => {
    const { expense, household } = await getAuthorizedExpense(ctx, args.expenseId);
    await removeExpense(ctx, {
      household,
      expense,
      now: Date.now(),
    });

    return { success: true as const };
  },
});

export const listMonthlyTransactions = query({
  args: { asOfTimestamp: v.number() },
  returns: v.array(monthlyTransaction),
  handler: async (ctx, { asOfTimestamp }) => {
    const { household } = await requireHouseholdMember(ctx);
    const timeZone = getEffectiveTimeZone(household, asOfTimestamp);
    const { startLocalDate } = getLocalMonthPeriod(asOfTimestamp, timeZone);
    const endExclusiveLocalDate = getNextMonthStart(startLocalDate);
    const expenses = await readExpensesByLocalDate(
      ctx,
      household._id,
      startLocalDate,
      endExclusiveLocalDate,
    );
    const incomes = await ctx.db
      .query("income")
      .withIndex("by_household_and_local_date", (q) =>
        q
          .eq("householdId", household._id)
          .gte("localDate", startLocalDate)
          .lt("localDate", endExclusiveLocalDate),
      )
      .collect();

    return [
      ...expenses.map((expense) => {
        const { amountCents, fromSavingsCents } = toExpenseFacts(expense);

        return {
          ...expense,
          fromSavingsCents,
          budgetImpactCents: budgetImpact(amountCents, fromSavingsCents),
          isWantPurchase: expense.goalId !== undefined,
          type: "expense" as const,
        };
      }),
      ...incomes.map((income) => ({
        ...income,
        name: income.source,
        type: "income" as const,
      })),
    ].sort((left, right) => right.localDate.localeCompare(left.localDate));
  },
});
