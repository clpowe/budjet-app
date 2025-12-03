import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export async function getHouseholdId(
  ctx: QueryCtx | MutationCtx,
  identity: { subject: string },
): Promise<Id<"households">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user || !user.householdId) {
    throw new Error("User is not in a household");
  }

  return user.householdId;
}
