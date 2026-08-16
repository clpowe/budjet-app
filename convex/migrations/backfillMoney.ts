import { v } from "convex/values";
import { legacyDollarsToCents } from "../../shared/utils/money-cents";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { getEffectiveTimeZone } from "../households";
import {
  ensureDailyBudgetRollup,
  getBudgetImpactCents,
  replaceDailyBudgetRollup,
} from "../lib/daily_budget_rollups";
import { getLocalDateKey, getLocalDayBounds } from "../lib/want_reserve";

export const HOUSEHOLDS_PER_BATCH = 10;
export const EXPENSES_PER_BATCH = 100;

const cursorValidator = v.union(v.string(), v.null());

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHouseholds, {
      householdCursor: null,
    });

    return null;
  },
});

export const processHouseholds = internalMutation({
  args: {
    householdCursor: cursorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("households").paginate({
      cursor: args.householdCursor,
      numItems: HOUSEHOLDS_PER_BATCH,
    });

    for (const household of page.page) {
      if (household.moneyMigrationCompletedAt !== undefined) {
        continue;
      }

      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHousehold, {
        householdId: household._id,
        expenseCursor: null,
        timeZone: null,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHouseholds, {
        householdCursor: page.continueCursor,
      });
    }

    return null;
  },
});

export const processHousehold = internalMutation({
  args: {
    householdId: v.id("households"),
    expenseCursor: cursorValidator,
    timeZone: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const household = await ctx.db.get(args.householdId);

    if (!household || household.moneyMigrationCompletedAt !== undefined) {
      return null;
    }

    if (household.allowance === undefined && household.allowanceCents === undefined) {
      throw new Error("Legacy household is missing its allowance");
    }

    const timeZone = args.timeZone ?? getEffectiveTimeZone(household, now);
    const allowanceCents =
      household.allowanceCents ?? legacyDollarsToCents(household.allowance as number);

    if (household.allowanceCents === undefined) {
      await ctx.db.patch(household._id, { allowanceCents });
    }

    const page = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .paginate({
        cursor: args.expenseCursor,
        numItems: EXPENSES_PER_BATCH,
      });

    for (const expense of page.page) {
      const amountCents = expense.amountCents ?? legacyDollarsToCents(expense.amount);
      const localDate = getLocalDateKey(expense.date, timeZone);

      if (expense.amountCents === undefined) {
        await ctx.db.patch(expense._id, { amountCents });
      }

      await ensureDailyBudgetRollup(ctx, {
        householdId: household._id,
        localDate,
        now,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHousehold, {
        householdId: household._id,
        expenseCursor: page.continueCursor,
        timeZone,
      });

      return null;
    }

    await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.rebuildHouseholdRollups, {
      householdId: household._id,
      timeZone,
      rollupCursor: null,
    });

    return null;
  },
});

export const rebuildHouseholdRollups = internalMutation({
  args: {
    householdId: v.id("households"),
    timeZone: v.string(),
    rollupCursor: cursorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const household = await ctx.db.get(args.householdId);

    if (!household || household.moneyMigrationCompletedAt !== undefined) {
      return null;
    }

    const page = await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", household._id))
      .paginate({
        cursor: args.rollupCursor,
        numItems: 1,
      });

    const rollup = page.page[0];

    if (!rollup) {
      await ctx.db.patch(household._id, {
        moneyMigrationCompletedAt: now,
      });

      return null;
    }

    await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.rebuildDailyBudgetRollup, {
      householdId: household._id,
      localDate: rollup.localDate,
      timeZone: args.timeZone,
      expenseCursor: null,
      expenseCents: 0n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 0n,
      nextRollupCursor: page.isDone ? null : page.continueCursor,
      completeWhenDone: page.isDone,
    });

    return null;
  },
});

export const rebuildDailyBudgetRollup = internalMutation({
  args: {
    householdId: v.id("households"),
    localDate: v.string(),
    timeZone: v.string(),
    expenseCursor: cursorValidator,
    expenseCents: v.int64(),
    reserveFundedExpenseCents: v.int64(),
    budgetImpactExpenseCents: v.int64(),
    nextRollupCursor: cursorValidator,
    completeWhenDone: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const household = await ctx.db.get(args.householdId);

    if (!household || household.moneyMigrationCompletedAt !== undefined) {
      return null;
    }

    const startTimestamp = new Date(`${args.localDate}T00:00:00.000Z`).getTime();
    const nextLocalDate = new Date(startTimestamp);
    nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);

    const startDate = new Date(startTimestamp).toISOString().slice(0, 10);
    const endDate = nextLocalDate.toISOString().slice(0, 10);

    const bounds = getLocalDayBounds(startDate, args.timeZone);
    const endBounds = getLocalDayBounds(endDate, args.timeZone);

    const page = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) =>
        q
          .eq("householdId", household._id)
          .gte("date", bounds.startTimestamp)
          .lt("date", endBounds.startTimestamp),
      )
      .paginate({
        cursor: args.expenseCursor,
        numItems: EXPENSES_PER_BATCH,
      });

    let expenseCents = args.expenseCents;
    let reserveFundedExpenseCents = args.reserveFundedExpenseCents;
    let budgetImpactExpenseCents = args.budgetImpactExpenseCents;

    for (const expense of page.page) {
      if (expense.amountCents === undefined) {
        throw new Error("Cannot rebuild a rollup before every expense is migrated");
      }

      const reserveUsedCents = expense.reserveUsedCents ?? 0n;
      const amountCents = expense.amountCents;

      expenseCents += amountCents;
      reserveFundedExpenseCents += reserveUsedCents;
      budgetImpactExpenseCents += getBudgetImpactCents({
        date: expense.date,
        amountCents,
        reserveUsedCents,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.rebuildDailyBudgetRollup, {
        ...args,
        expenseCursor: page.continueCursor,
        expenseCents,
        reserveFundedExpenseCents,
        budgetImpactExpenseCents,
      });

      return null;
    }

    await replaceDailyBudgetRollup(ctx, {
      householdId: household._id,
      localDate: args.localDate,
      expenseCents,
      reserveFundedExpenseCents,
      budgetImpactExpenseCents,
      now,
    });

    if (args.completeWhenDone) {
      await ctx.db.patch(household._id, {
        moneyMigrationCompletedAt: now,
      });

      return null;
    }

    await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.rebuildHouseholdRollups, {
      householdId: household._id,
      timeZone: args.timeZone,
      rollupCursor: args.nextRollupCursor,
    });

    return null;
  },
});
