// Already scheduled sweeps carry cursors issued for the original state table.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
export { closeThrough } from "./savingsMaintenance";

export const closeEligibleDays = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    await ctx.scheduler.runAfter(0, internal.savingsMaintenance.closeEligibleDays, {
      cursor,
      table: "goalReserveStates",
    });
    return null;
  },
});
