import type { UserIdentity } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseCtx = QueryCtx | MutationCtx;

export async function getAuthenticatedIdentity(ctx: DatabaseCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Not authenticated");
  }

  return identity;
}

export async function findUserByIdentity(
  ctx: DatabaseCtx,
  identity: UserIdentity,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_identity_key", (q) => q.eq("identityKey", identity.tokenIdentifier))
    .unique();
}

export async function findCurrentUser(ctx: DatabaseCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return await findUserByIdentity(ctx, identity);
}

export async function getAuthenticatedUser(ctx: DatabaseCtx): Promise<Doc<"users">> {
  const identity = await getAuthenticatedIdentity(ctx);
  const user = await findUserByIdentity(ctx, identity);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

export async function getHouseholdId(ctx: DatabaseCtx): Promise<Id<"households">> {
  const user = await getAuthenticatedUser(ctx);

  if (!user.householdId) {
    throw new Error("User is not in a household");
  }

  return user.householdId;
}
