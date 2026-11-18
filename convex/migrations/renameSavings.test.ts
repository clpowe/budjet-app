/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { insertHousehold, testIdentity } from "../test_utils/seed";

const modules = {
  ...import.meta.glob("../**/*.ts"),
  "../migrations/renameSavings.ts": () => import("./renameSavings"),
};
const now = Date.UTC(2026, 2, 10, 16);
const day = "2026-03-10";
afterEach(() => vi.useRealTimers());

test("copies legacy money exactly and verifies both tables before switching the hourly sweep", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const { householdId, expenseIds } = await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });
    await insertHousehold(ctx, { owner: "inactive" });
    await ctx.db.insert("goalReserveStates", {
      householdId,
      activatedAt: 10,
      firstEligibleLocalDate: "2026-03-01",
      lastClosedLocalDate: "2026-03-09",
      updatedAt: 20,
      positionCents: -1000n,
    });
    await ctx.db.insert("dailyBudgetRollups", {
      householdId,
      localDate: day,
      updatedAt: 30,
      expenseCents: 5000n,
      reserveFundedExpenseCents: 3000n,
      budgetImpactExpenseCents: 2000n,
    });
    const expenseIds = [];
    for (const funding of [undefined, 0n, 3000n]) {
      expenseIds.push(
        await ctx.db.insert("expenses", {
          householdId,
          localDate: day,
          date: now,
          amountCents: 5000n,
          amount: 50,
          notes: "",
          name: "Purchase",
          ...(funding === undefined ? {} : { reserveUsedCents: funding }),
        }),
      );
    }
    return { householdId, expenseIds };
  });
  const owner = t.withIdentity(testIdentity("owner"));
  const before = await owner.query(api.budget.getHomeSummary, { asOfTimestamp: now });
  const oldSummary = await owner.query(api.reserve.getSummary, { now });
  const newSummary = await owner.query(api.savings.getSummary, { now });
  expect(newSummary.availableSavingsCents).toBe(oldSummary.availableReserveCents);
  expect(newSummary.recoveryAmountCents).toBe(1000n);

  for (let run = 0; run < 2; run++) {
    await t.mutation(internal.migrations.renameSavings.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await owner.query(api.budget.getHomeSummary, { asOfTimestamp: now })).toEqual(before);
    expect(await owner.query(api.savings.getSummary, { now })).toEqual(newSummary);
    await t.run(async (ctx) => {
      const states = await ctx.db.query("goalSavingsStates").collect();
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({
        householdId,
        positionCents: -1000n,
        activatedAt: 10,
        updatedAt: 20,
        firstEligibleLocalDate: "2026-03-01",
        lastClosedLocalDate: "2026-03-09",
      });
      expect(await ctx.db.query("savingsMigration").unique()).toBeTruthy();
      const rows = await Promise.all(expenseIds.map((id) => ctx.db.get(id)));
      expect(rows[0]).not.toHaveProperty("savingsUsedCents");
      expect(rows[1]?.savingsUsedCents).toBe(0n);
      expect(rows[2]?.savingsUsedCents).toBe(3000n);
      expect(await ctx.db.query("dailyBudgetRollups").unique()).toMatchObject({
        savingsFundedExpenseCents: 3000n,
      });
    });
  }
});

test("mirrors a mixed-funded purchase made after its state is copied and before cutover", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const itemId = await t.run(async (ctx) => {
    const { householdId, ownerId } = await insertHousehold(ctx, { owner: "owner" });
    await ctx.db.insert("goalReserveStates", {
      householdId,
      activatedAt: 0,
      firstEligibleLocalDate: day,
      updatedAt: 0,
      positionCents: 3000n,
    });
    return ctx.db.insert("wantItems", {
      householdId,
      name: "Lamp",
      notes: "",
      estimatedCostCents: 5000n,
      priority: "high",
      status: "plan_for_it",
      order: 0,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  await t.mutation(internal.migrations.renameSavings.batch, {
    table: "goalReserveStates",
    cursor: null,
    verify: false,
  });
  const result = await t.withIdentity(testIdentity("owner")).mutation(api.wants.purchase, {
    itemId,
    actualAmountCents: 5000n,
    purchaseLocalDate: day,
    apiVersion: 2,
  });
  expect(result).toMatchObject({
    status: "purchased",
    savingsUsedCents: 3000n,
    reserveUsedCents: 3000n,
    budgetImpactCents: 2000n,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    for (const table of ["goalSavingsStates", "goalReserveStates"] as const) {
      expect((await ctx.db.query(table).unique())?.positionCents).toBe(0n);
    }
    expect(await ctx.db.query("dailyBudgetRollups").unique()).toMatchObject({
      reserveFundedExpenseCents: 3000n,
      savingsFundedExpenseCents: 3000n,
    });
    expect(await ctx.db.query("savingsMigration").unique()).toBeTruthy();
  });
});

test("halts on conflicting funding without switching readers or overwriting either amount", async () => {
  const t = convexTest(schema, modules);
  const expenseId = await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });
    return ctx.db.insert("expenses", {
      householdId,
      name: "Lamp",
      notes: "",
      date: now,
      amount: 50,
      amountCents: 5000n,
      reserveUsedCents: 3000n,
      savingsUsedCents: 2000n,
    });
  });
  await expect(
    t.mutation(internal.migrations.renameSavings.batch, {
      table: "expenses",
      cursor: null,
      verify: false,
    }),
  ).rejects.toThrow("Savings funding mismatch");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("savingsMigration").unique()).toBeNull();
    expect(await ctx.db.get(expenseId)).toMatchObject({
      reserveUsedCents: 3000n,
      savingsUsedCents: 2000n,
    });
  });
});
