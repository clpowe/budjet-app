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

    const ownIncomeId = await ctx.db.insert("income", {
      source: "Bonus",
      notes: "",
      householdId,
      amountCents: 10_000n,
      localDate: "2026-03-01",
    });
    const otherIncomeId = await ctx.db.insert("income", {
      source: "Gift",
      notes: "",
      householdId: otherHouseholdId,
      amountCents: 5_000n,
      localDate: "2026-03-01",
    });

    return { householdId, otherHouseholdId, ownIncomeId, otherIncomeId };
  });
}

test("income reads are scoped to the caller's household", async () => {
  const t = convexTest(schema, modules);
  const { ownIncomeId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const list = await asOwner.query(api.income.listIncome, {});

  expect(list.map((income) => income._id)).toEqual([ownIncomeId]);
  expect(await asOwner.query(api.income.getMyIncomeTotal, {})).toBe(10_000n);
});

test("signed-out callers see no income", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  expect(await t.query(api.income.listIncome, {})).toEqual([]);
  expect(await t.query(api.income.getMyIncomeTotal, {})).toBe(0n);
});

test("adding income uses the caller's household", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const incomeId = await asOwner.mutation(api.income.addIncome, {
    source: "Refund",
    notes: "",
    amountCents: 2_000n,
    localDate: "2026-03-02",
  });

  const stored = await t.run((ctx) => ctx.db.get("income", incomeId));
  expect(stored).toMatchObject({ householdId, amountCents: 2_000n, localDate: "2026-03-02" });
});

test("adding income rejects a malformed local date", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await expect(
    asOwner.mutation(api.income.addIncome, {
      source: "Refund",
      notes: "",
      amountCents: 2_000n,
      localDate: "03/02/2026",
    }),
  ).rejects.toThrow();
});

test("adding income requires a signed-in household member", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  await expect(
    t.mutation(api.income.addIncome, {
      source: "Refund",
      notes: "",
      amountCents: 2_000n,
      localDate: "2026-03-02",
    }),
  ).rejects.toThrow("Not authenticated");
});

test("updating keeps the date when none is sent", async () => {
  const t = convexTest(schema, modules);
  const { ownIncomeId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.income.updateIncome, {
    incomeId: ownIncomeId,
    source: "Bigger bonus",
    notes: "edited",
    amountCents: 15_000n,
  });

  const stored = await t.run((ctx) => ctx.db.get("income", ownIncomeId));
  expect(stored).toMatchObject({
    source: "Bigger bonus",
    amountCents: 15_000n,
    localDate: "2026-03-01",
  });
});

test("another household cannot update or delete income", async () => {
  const t = convexTest(schema, modules);
  const { otherIncomeId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await expect(
    asOwner.mutation(api.income.updateIncome, {
      incomeId: otherIncomeId,
      source: "Hijacked",
      notes: "",
      amountCents: 1n,
    }),
  ).rejects.toThrow("Income not found");

  await expect(
    asOwner.mutation(api.income.deleteIncome, { incomeId: otherIncomeId }),
  ).rejects.toThrow("Income not found");

  const stored = await t.run((ctx) => ctx.db.get("income", otherIncomeId));
  expect(stored).toMatchObject({ source: "Gift", amountCents: 5_000n });
});

test("a member can delete their own income", async () => {
  const t = convexTest(schema, modules);
  const { ownIncomeId } = await seed(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.income.deleteIncome, { incomeId: ownIncomeId });

  expect(await t.run((ctx) => ctx.db.get("income", ownIncomeId))).toBeNull();
});
