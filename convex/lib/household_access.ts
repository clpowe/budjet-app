import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findCurrentUser, getAuthenticatedUser } from "./helpers";

type DatabaseCtx = QueryCtx | MutationCtx;

/** Tables whose documents always belong to exactly one Household. */
export type HouseholdTable = {
  [Table in TableNames]: Doc<Table> extends { householdId: Id<"households"> } ? Table : never;
}[TableNames];

export type HouseholdMember = {
  user: Doc<"users">;
  household: Doc<"households">;
};

/**
 * Resolves the authenticated user and the Household they belong to.
 *
 * Throws "Not authenticated", "User not found", "User is not in a household"
 * or "Household not found". Never accepts a client-supplied household id.
 */
export async function requireHouseholdMember(ctx: DatabaseCtx): Promise<HouseholdMember> {
  const user = await getAuthenticatedUser(ctx);

  if (!user.householdId) {
    throw new Error("User is not in a household");
  }

  const household = await ctx.db.get("households", user.householdId);

  if (!household) {
    throw new Error("Household not found");
  }

  return { user, household };
}

/**
 * Like `requireHouseholdMember`, but returns null instead of throwing when the
 * caller is signed out, has no user row, or has no household. For read-only
 * queries that render an empty state for those callers.
 */
export async function findHouseholdMember(ctx: DatabaseCtx): Promise<HouseholdMember | null> {
  const user = await findCurrentUser(ctx);

  if (!user?.householdId) {
    return null;
  }

  const household = await ctx.db.get("households", user.householdId);

  return household ? { user, household } : null;
}

/**
 * Loads a document and proves it belongs to the given Household.
 *
 * A missing document and another household's document fail with the same
 * message, so callers cannot probe for ids outside their Household.
 */
export async function requireHouseholdDoc<Table extends HouseholdTable>(
  ctx: DatabaseCtx,
  table: Table,
  id: Id<Table>,
  householdId: Id<"households">,
  notFoundMessage: string,
): Promise<Doc<Table>> {
  const doc = await ctx.db.get(table, id);

  if (!doc || doc.householdId !== householdId) {
    throw new Error(notFoundMessage);
  }

  return doc;
}
