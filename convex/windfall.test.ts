/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { insertHousehold } from "./test_utils/seed";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });
    const { householdId: otherHouseholdId } = await insertHousehold(ctx, { owner: "other" });

    const ownWindfallId = await ctx.db.insert("windfall", {
      source: "Bonus",
      notes: "",
      householdId,
      amount: 100,
      date: 1,
    });
    const otherWindfallId = await ctx.db.insert("windfall", {
      source: "Gift",
      notes: "",
      householdId: otherHouseholdId,
      amount: 50,
      date: 1,
    });

    return { householdId, otherHouseholdId, ownWindfallId, otherWindfallId };
  });
}

test("windfall reads are scoped to the caller's household", async () => {
  const t = convexTest(schema, modules);
  const { ownWindfallId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const list = await asOwner.query(api.windfall.listWindfall, {});

  expect(list.map((windfall) => windfall._id)).toEqual([ownWindfallId]);
  expect(await asOwner.query(api.windfall.getMyWindfallTotal, {})).toBe(100);
});

test("signed-out callers see no windfalls", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  expect(await t.query(api.windfall.listWindfall, {})).toEqual([]);
  expect(await t.query(api.windfall.getMyWindfallTotal, {})).toBe(0);
});

test("adding a windfall uses the caller's household", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const windfallId = await asOwner.mutation(api.windfall.addWindfallTransaction, {
    source: "Refund",
    notes: "",
    amount: 20,
    date: 2,
  });

  const stored = await t.run((ctx) => ctx.db.get("windfall", windfallId));
  expect(stored?.householdId).toBe(householdId);
});

test("adding a windfall requires a signed-in household member", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(
    t.mutation(api.windfall.addWindfallTransaction, {
      source: "Refund",
      notes: "",
      amount: 20,
      date: 2,
    }),
  ).rejects.toThrow("Not authenticated");
});

test("updating keeps the date when none is sent", async () => {
  const t = convexTest(schema, modules);
  const { ownWindfallId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.windfall.updateWindfall, {
    windfallId: ownWindfallId,
    source: "Bigger bonus",
    notes: "edited",
    amount: 150,
  });

  const stored = await t.run((ctx) => ctx.db.get("windfall", ownWindfallId));
  expect(stored).toMatchObject({ source: "Bigger bonus", amount: 150, date: 1 });
});

test("another household cannot update or delete a windfall", async () => {
  const t = convexTest(schema, modules);
  const { otherWindfallId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await expect(
    asOwner.mutation(api.windfall.updateWindfall, {
      windfallId: otherWindfallId,
      source: "Hijacked",
      notes: "",
      amount: 1,
    }),
  ).rejects.toThrow("Windfall not found");

  await expect(
    asOwner.mutation(api.windfall.deleteWindfall, { windfallId: otherWindfallId }),
  ).rejects.toThrow("Windfall not found");

  const stored = await t.run((ctx) => ctx.db.get("windfall", otherWindfallId));
  expect(stored).toMatchObject({ source: "Gift", amount: 50 });
});

test("a member can delete their own windfall", async () => {
  const t = convexTest(schema, modules);
  const { ownWindfallId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.windfall.deleteWindfall, { windfallId: ownWindfallId });

  expect(await t.run((ctx) => ctx.db.get("windfall", ownWindfallId))).toBeNull();
});
