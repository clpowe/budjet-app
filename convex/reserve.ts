// Keep the original query available to clients opened before the savings rename.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { readSavingsSummary, savingsSummaryValidator } from "./savings";

export const getSummary = query({
  args: { now: v.number() },
  returns: savingsSummaryValidator
    .omit("availableSavingsCents")
    .extend({ availableReserveCents: v.int64() }),
  handler: async (ctx, { now }) => {
    const { availableSavingsCents, ...summary } = await readSavingsSummary(ctx, now);
    return { ...summary, availableReserveCents: availableSavingsCents };
  },
});
