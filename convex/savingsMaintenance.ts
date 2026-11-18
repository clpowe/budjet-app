import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { CLOSE_DAYS_PER_TRANSACTION, closeSavingsDays } from "./lib/savings_account";

export { CLOSE_DAYS_PER_TRANSACTION };
export const HOUSEHOLDS_PER_BATCH = 25;

const cursorValidator = v.union(v.string(), v.null());

const closeResultValidator = v.object({
  complete: v.boolean(),
  lastClosedLocalDate: v.optional(v.string()),
});

/** Closes one household's days; keeps rescheduling itself until caught up. */
export const closeThrough = internalMutation({
  args: {
    householdId: v.id("households"),
    throughExclusiveTimestamp: v.number(),
    maxDays: v.number(),
  },
  returns: closeResultValidator,
  handler: async (ctx, args) => {
    const result = await closeSavingsDays(ctx, args);

    if (!result.complete) {
      await ctx.scheduler.runAfter(0, internal.savingsMaintenance.closeThrough, args);
    }

    return result;
  },
});

/** Hourly sweep over every activated household. */
export const closeEligibleDays = internalMutation({
  args: {
    cursor: cursorValidator,
    table: v.optional(v.union(v.literal("goalSavingsStates"), v.literal("goalReserveStates"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const serverNow = Date.now();
    const table =
      args.table ??
      ((await ctx.db.query("savingsMigration").unique())
        ? "goalSavingsStates"
        : "goalReserveStates");
    const page = await ctx.db.query(table).paginate({
      cursor: args.cursor,
      numItems: HOUSEHOLDS_PER_BATCH,
    });

    let hasIncompleteHousehold = false;

    for (const savingsState of page.page) {
      const result = await closeSavingsDays(ctx, {
        householdId: savingsState.householdId,
        throughExclusiveTimestamp: serverNow,
        maxDays: CLOSE_DAYS_PER_TRANSACTION,
      });

      if (!result.complete) {
        hasIncompleteHousehold = true;
      }
    }

    if (!page.isDone || hasIncompleteHousehold) {
      await ctx.scheduler.runAfter(0, internal.savingsMaintenance.closeEligibleDays, {
        cursor: page.isDone ? null : page.continueCursor,
        table,
      });
    }

    return null;
  },
});
