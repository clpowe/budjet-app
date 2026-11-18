import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";

export const DOCS_PER_BATCH = 200;

const tableValidator = v.union(v.literal("goalReserveDays"), v.literal("goalReserveLedgerEntries"));

async function deleteBatch(
  ctx: MutationCtx,
  table: "goalReserveDays" | "goalReserveLedgerEntries",
): Promise<number> {
  if (table === "goalReserveDays") {
    const docs = await ctx.db.query("goalReserveDays").take(DOCS_PER_BATCH);

    for (const doc of docs) {
      await ctx.db.delete("goalReserveDays", doc._id);
    }

    return docs.length;
  }

  const docs = await ctx.db.query("goalReserveLedgerEntries").take(DOCS_PER_BATCH);

  for (const doc of docs) {
    await ctx.db.delete("goalReserveLedgerEntries", doc._id);
  }

  return docs.length;
}

/**
 * Deletes every row of a retired reserve table, one batch per transaction.
 * Run once per deployment for each table, after the code that stopped writing
 * them is deployed:
 *
 *   npx convex run migrations/clearReserveHistory:run '{"table":"goalReserveDays"}'
 *   npx convex run migrations/clearReserveHistory:run '{"table":"goalReserveLedgerEntries"}'
 */
export const run = internalMutation({
  args: {
    table: tableValidator,
  },
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const deleted = await deleteBatch(ctx, args.table);
    const isDone = deleted < DOCS_PER_BATCH;

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.clearReserveHistory.run, args);
    }

    return { deleted, isDone };
  },
});
