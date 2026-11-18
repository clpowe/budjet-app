import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Test-only fixtures. Imported by convex-test suites; never by app functions.

type HouseholdFields = Omit<Doc<"households">, "_id" | "_creationTime" | "ownerId">;

export type SeedHouseholdOptions = {
  /** Identity token key of the owner, e.g. "owner" → tokenIdentifier "test|owner". */
  owner: string;
  /** Extra members, same key format. */
  members?: string[];
  inviteCode?: string;
  household?: Partial<HouseholdFields>;
};

export type SeededHousehold = {
  householdId: Id<"households">;
  ownerId: Id<"users">;
  memberIds: Id<"users">[];
};

/** A migrated household: cents allowance $55, New York zone, savings features unlocked. */
export const DEFAULT_TEST_HOUSEHOLD: HouseholdFields = {
  name: "Test household",
  inviteCode: "TEST000",
  allowance: 55,
  allowanceCents: 5_500n,
  timeZone: "America/New_York",
  moneyMigrationCompletedAt: 0,
  createdAt: 0,
};

export function testIdentity(key: string) {
  return { tokenIdentifier: `test|${key}` };
}

export async function insertUser(
  ctx: MutationCtx,
  key: string,
  role: Doc<"users">["role"] = "member",
): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    identityKey: testIdentity(key).tokenIdentifier,
    email: `${key}@example.com`,
    role,
    createdAt: 0,
  });
}

/**
 * Inserts an owner, optional members and their household, and links them.
 * Call inside `t.run`.
 */
export async function insertHousehold(
  ctx: MutationCtx,
  { owner, members = [], inviteCode, household = {} }: SeedHouseholdOptions,
): Promise<SeededHousehold> {
  const ownerId = await insertUser(ctx, owner, "owner");
  const memberIds: Id<"users">[] = [];

  for (const member of members) {
    memberIds.push(await insertUser(ctx, member, "member"));
  }

  const householdId = await ctx.db.insert("households", {
    ...DEFAULT_TEST_HOUSEHOLD,
    inviteCode: inviteCode ?? owner.toUpperCase().slice(0, 7).padEnd(7, "0"),
    ...household,
    ownerId,
  });

  for (const userId of [ownerId, ...memberIds]) {
    await ctx.db.patch("users", userId, { householdId });
  }

  return { householdId, ownerId, memberIds };
}
