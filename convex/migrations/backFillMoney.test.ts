/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const march8 = Date.UTC(2026, 2, 8, 16);
const march9 = Date.UTC(2026, 2, 9, 16);

async function seedLegacyHousehold(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: 0,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Legacy household",
      inviteCode: "LEGACY",
      ownerId,
      allowance: 0.1 + 0.2,
      timeZone: "America/New_York",
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });

    const wantItemId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "considering",
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 0,
      updatedAt: 0,
    });

    await ctx.db.insert("expenses", {
      householdId,
      name: "Floating-point amount",
      notes: "",
      amount: 0.1 + 0.2,
      date: march8,
    });

    for (let index = 0; index < 100; index += 1) {
      await ctx.db.insert("expenses", {
        householdId,
        name: `Expense ${index}`,
        notes: "",
        amount: 1.01,
        date: march9,
      });
    }

    return { householdId, ownerId, wantItemId };
  });
}

async function readMigrationState(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedLegacyHousehold>>["householdId"],
) {
  return await t.run(async (ctx) => {
    const household = await ctx.db.get(householdId);
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();
    const rollups = await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();

    return { household, expenses, rollups };
  });
}

test("keeps activation pending until a legacy household has exact money rollups", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLegacyHousehold(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const result = await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.wantItemId,
    status: "plan_for_it",
  });

  expect(result).toEqual({
    kind: "money_migration_pending",
  });

  const wantItem = await t.run(async (ctx) => await ctx.db.get(seeded.wantItemId));

  expect(wantItem?.status).toBe("considering");
});

test("backfills cents and exact local-day rollups across pages without double counting retries", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLegacyHousehold(t);

  await t.mutation(internal.migrations.backfillMoney.processHousehold, {
    householdId: seeded.householdId,
    expenseCursor: null,
    timeZone: null,
  });

  const interim = await readMigrationState(t, seeded.householdId);

  expect(interim.expenses.filter((expense) => expense.amountCents !== undefined)).toHaveLength(100);
  expect(interim.household?.moneyMigrationCompletedAt).toBeUndefined();

  await t.mutation(internal.migrations.backfillMoney.processHousehold, {
    householdId: seeded.householdId,
    expenseCursor: null,
    timeZone: null,
  });
  await t.finishInProgressScheduledFunctions();

  const completed = await readMigrationState(t, seeded.householdId);

  expect(completed.household).toMatchObject({
    allowance: 0.1 + 0.2,
    allowanceCents: 30n,
    timeZone: "America/New_York",
  });
  expect(completed.household?.moneyMigrationCompletedAt).toEqual(expect.any(Number));
  expect(completed.expenses).toHaveLength(101);
  expect(completed.expenses.every((expense) => expense.amountCents !== undefined)).toBe(true);
  expect(
    completed.expenses.find((expense) => expense.name === "Floating-point amount"),
  ).toMatchObject({
    amount: 0.1 + 0.2,
    amountCents: 30n,
  });
  expect(completed.rollups).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        localDate: "2026-03-08",
        expenseCents: 30n,
        reserveFundedExpenseCents: 0n,
        budgetImpactExpenseCents: 30n,
      }),
      expect.objectContaining({
        localDate: "2026-03-09",
        expenseCents: 10_100n,
        reserveFundedExpenseCents: 0n,
        budgetImpactExpenseCents: 10_100n,
      }),
    ]),
  );

  const rollupsBeforeRetry = completed.rollups.map((rollup) => ({
    localDate: rollup.localDate,
    expenseCents: rollup.expenseCents,
    reserveFundedExpenseCents: rollup.reserveFundedExpenseCents,
    budgetImpactExpenseCents: rollup.budgetImpactExpenseCents,
  }));

  await t.mutation(internal.migrations.backfillMoney.start, {});
  await t.finishInProgressScheduledFunctions();

  const afterRetry = await readMigrationState(t, seeded.householdId);
  const rollupsAfterRetry = afterRetry.rollups.map((rollup) => ({
    localDate: rollup.localDate,
    expenseCents: rollup.expenseCents,
    reserveFundedExpenseCents: rollup.reserveFundedExpenseCents,
    budgetImpactExpenseCents: rollup.budgetImpactExpenseCents,
  }));

  expect(rollupsAfterRetry).toEqual(rollupsBeforeRetry);
});
