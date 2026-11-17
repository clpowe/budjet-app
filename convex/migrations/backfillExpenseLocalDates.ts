import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { getStoredHouseholdTimeZone } from "../households";
import { getLocalDateKey } from "../lib/want_reserve";

export const EXPENSES_PER_BATCH = 100;

/**
 * Best-effort day for a legacy expense. Rollups and reserve days were keyed
 * with the zone in force when the expense was written, which is not recorded
 * for rollups. Use the household's stored zone, then prefer the zone a closed
 * reserve day recorded for that date when the two disagree.
 */
async function inferLocalDate(
  ctx: MutationCtx,
  expense: Doc<"expenses">,
  household: Doc<"households"> | null,
): Promise<string> {
  const storedZone = getStoredHouseholdTimeZone(household ?? {});
  const candidate = getLocalDateKey(expense.date, storedZone);

  const reserveDay = await ctx.db
    .query("goalReserveDays")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", expense.householdId).eq("localDate", candidate),
    )
    .unique();

  if (!reserveDay || reserveDay.timeZone === storedZone) {
    return candidate;
  }

  return getLocalDateKey(expense.date, reserveDay.timeZone);
}

/** Run once: `npx convex run migrations/backfillExpenseLocalDates:run '{"cursor":null}'`. */
export const run = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ patched: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("expenses").paginate({
      cursor: args.cursor,
      numItems: EXPENSES_PER_BATCH,
    });
    const households = new Map<Id<"households">, Doc<"households"> | null>();
    let patched = 0;

    for (const expense of page.page) {
      if (expense.localDate !== undefined) {
        continue;
      }

      if (!households.has(expense.householdId)) {
        households.set(expense.householdId, await ctx.db.get("households", expense.householdId));
      }

      const localDate = await inferLocalDate(ctx, expense, households.get(expense.householdId)!);
      await ctx.db.patch("expenses", expense._id, { localDate });
      patched += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillExpenseLocalDates.run, {
        cursor: page.continueCursor,
      });
    }

    return { patched, isDone: page.isDone };
  },
});
