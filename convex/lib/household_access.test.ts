/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { insertHousehold, insertUser } from "../test_utils/seed";
import {
  findHouseholdMember,
  requireHouseholdDoc,
  requireHouseholdMember,
} from "./household_access";

const modules = import.meta.glob("../**/*.ts");

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const { householdId, ownerId: memberId } = await insertHousehold(ctx, { owner: "member" });
    const { householdId: otherHouseholdId } = await insertHousehold(ctx, { owner: "other" });
    await insertUser(ctx, "homeless");

    const ownWindfallId = await ctx.db.insert("windfall", {
      source: "Bonus",
      notes: "",
      householdId,
      amount: 100,
    });
    const otherWindfallId = await ctx.db.insert("windfall", {
      source: "Gift",
      notes: "",
      householdId: otherHouseholdId,
      amount: 50,
    });

    return { memberId, householdId, otherHouseholdId, ownWindfallId, otherWindfallId };
  });
}

test("requireHouseholdMember rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(t.run((ctx) => requireHouseholdMember(ctx))).rejects.toThrow("Not authenticated");
});

test("requireHouseholdMember rejects an identity with no user row", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "test|stranger" }).run((ctx) => requireHouseholdMember(ctx)),
  ).rejects.toThrow("User not found");
});

test("requireHouseholdMember rejects a user without a household", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "test|homeless" }).run((ctx) => requireHouseholdMember(ctx)),
  ).rejects.toThrow("User is not in a household");
});

test("requireHouseholdMember rejects a user whose household was deleted", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seed(t);
  await t.run((ctx) => ctx.db.delete("households", householdId));

  await expect(
    t.withIdentity({ tokenIdentifier: "test|member" }).run((ctx) => requireHouseholdMember(ctx)),
  ).rejects.toThrow("Household not found");
});

test("requireHouseholdMember returns the caller and their household", async () => {
  const t = convexTest(schema, modules);
  const { memberId, householdId } = await seed(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "test|member" })
    .run((ctx) => requireHouseholdMember(ctx));

  expect(result.user._id).toBe(memberId);
  expect(result.household._id).toBe(householdId);
});

test("findHouseholdMember returns null instead of throwing", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seed(t);

  expect(await t.run((ctx) => findHouseholdMember(ctx))).toBeNull();
  expect(
    await t
      .withIdentity({ tokenIdentifier: "test|homeless" })
      .run((ctx) => findHouseholdMember(ctx)),
  ).toBeNull();

  const member = await t
    .withIdentity({ tokenIdentifier: "test|member" })
    .run((ctx) => findHouseholdMember(ctx));

  expect(member?.household._id).toBe(householdId);
});

test("requireHouseholdDoc returns a document from the caller's household", async () => {
  const t = convexTest(schema, modules);
  const { householdId, ownWindfallId } = await seed(t);

  const doc = await t.run((ctx) =>
    requireHouseholdDoc(ctx, "windfall", ownWindfallId, householdId, "Windfall not found"),
  );

  expect(doc._id).toBe(ownWindfallId);
});

test("requireHouseholdDoc hides another household's document", async () => {
  const t = convexTest(schema, modules);
  const { householdId, otherWindfallId } = await seed(t);

  await expect(
    t.run((ctx) =>
      requireHouseholdDoc(ctx, "windfall", otherWindfallId, householdId, "Windfall not found"),
    ),
  ).rejects.toThrow("Windfall not found");
});

test("requireHouseholdDoc treats a deleted document as not found", async () => {
  const t = convexTest(schema, modules);
  const { householdId, ownWindfallId } = await seed(t);
  await t.run((ctx) => ctx.db.delete("windfall", ownWindfallId));

  await expect(
    t.run((ctx) =>
      requireHouseholdDoc(ctx, "windfall", ownWindfallId, householdId, "Windfall not found"),
    ),
  ).rejects.toThrow("Windfall not found");
});
