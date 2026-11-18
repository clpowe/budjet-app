// Start with {}. Copy and verification use separate, resumable table scans.
// Normal account writes mirror both representations in the same transaction.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const tables = [
  "goalReserveStates",
  "expenses",
  "dailyBudgetRollups",
  "goalSavingsStates",
] as const;
const tableValidator = v.union(...tables.map((table) => v.literal(table)));

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.migrations.renameSavings.batch, {
      table: "goalReserveStates",
      cursor: null,
      verify: false,
    });
    return null;
  },
});

export const batch = internalMutation({
  args: { table: tableValidator, cursor: v.union(v.string(), v.null()), verify: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { table, cursor, verify }) => {
    const options = { cursor, numItems: 100 };
    let page: { isDone: boolean; continueCursor: string };
    if (table === "goalReserveStates") {
      const states = await ctx.db.query(table).paginate(options);
      page = states;
      for (const { _id, _creationTime, ...state } of states.page) {
        const copy = await ctx.db
          .query("goalSavingsStates")
          .withIndex("by_household", (q) => q.eq("householdId", state.householdId))
          .unique();
        if (!copy && !verify) {
          await ctx.db.insert("goalSavingsStates", state);
        } else if (
          !copy ||
          state.positionCents !== copy.positionCents ||
          state.firstEligibleLocalDate !== copy.firstEligibleLocalDate ||
          state.lastClosedLocalDate !== copy.lastClosedLocalDate ||
          state.activatedAt !== copy.activatedAt ||
          state.updatedAt !== copy.updatedAt
        ) {
          throw new Error(`Savings state mismatch for household ${state.householdId}`);
        }
      }
    } else if (table === "expenses") {
      const expenses = await ctx.db.query(table).paginate(options);
      page = expenses;
      for (const expense of expenses.page) {
        if (expense.reserveUsedCents === expense.savingsUsedCents) continue;
        if (verify || expense.savingsUsedCents !== undefined)
          throw new Error(`Savings funding mismatch on expense ${expense._id}`);
        await ctx.db.patch(expense._id, { savingsUsedCents: expense.reserveUsedCents });
      }
    } else if (table === "dailyBudgetRollups") {
      const rollups = await ctx.db.query(table).paginate(options);
      page = rollups;
      for (const rollup of rollups.page) {
        if (rollup.reserveFundedExpenseCents === rollup.savingsFundedExpenseCents) continue;
        if (verify || rollup.savingsFundedExpenseCents !== undefined)
          throw new Error(`Savings funding mismatch on rollup ${rollup._id}`);
        await ctx.db.patch(rollup._id, {
          savingsFundedExpenseCents: rollup.reserveFundedExpenseCents,
        });
      }
    } else {
      const copies = await ctx.db.query(table).paginate(options);
      page = copies;
      for (const copy of copies.page) {
        const original = await ctx.db
          .query("goalReserveStates")
          .withIndex("by_household", (q) => q.eq("householdId", copy.householdId))
          .unique();
        if (!original) throw new Error(`Missing legacy state for household ${copy.householdId}`);
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.renameSavings.batch, {
        table,
        verify,
        cursor: page.continueCursor,
      });
    } else if (table === "dailyBudgetRollups" && !verify) {
      await ctx.scheduler.runAfter(0, internal.migrations.renameSavings.batch, {
        table: "goalReserveStates",
        verify: true,
        cursor: null,
      });
    } else if (table !== "goalSavingsStates") {
      await ctx.scheduler.runAfter(0, internal.migrations.renameSavings.batch, {
        table: tables[tables.indexOf(table) + 1]!,
        verify,
        cursor: null,
      });
    } else if (!(await ctx.db.query("savingsMigration").unique())) {
      await ctx.db.insert("savingsMigration", { verifiedAt: Date.now() });
    }
    return null;
  },
});
