/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { calculateSafeToSpendCents } from "./budget";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);
const marchStartNewYork = Date.UTC(2026, 2, 1, 5);
const aprilStartNewYork = Date.UTC(2026, 3, 1, 4);

describe("calculateSafeToSpendCents", () => {
  test.each([
    {
      scenario: "$30 spent and $20 saved today after close",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 3_000n,
      currentPlanSetAsideCents: 2_000n,
      expected: 145_000n,
    },
    {
      scenario: "the same $20 reserve is spent this month",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 3_000n,
      currentPlanSetAsideCents: 2_000n,
      expected: 145_000n,
    },
    {
      scenario: "$20 of prior-month reserve is spent this month",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 0n,
      currentPlanSetAsideCents: 0n,
      expected: 150_000n,
    },
    {
      scenario: "a $120 purchase uses $100 of prior-month reserve",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 2_000n,
      currentPlanSetAsideCents: 0n,
      expected: 148_000n,
    },
    {
      scenario: "a closed day is corrected from +$20 to -$5",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 5_500n,
      currentPlanSetAsideCents: 0n,
      expected: 144_500n,
    },
  ])("returns exact cents when $scenario", (row) => {
    expect(calculateSafeToSpendCents(row)).toBe(row.expected);
  });

  test("does not subtract the current-day live negative adjustment a second time", () => {
    expect(
      calculateSafeToSpendCents({
        planAllowanceCents: 150_000n,
        budgetImpactExpenseCents: 7_000n,
        currentPlanSetAsideCents: 0n,
      }),
    ).toBe(143_000n);
  });
});

async function seedHousehold(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: 0,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Primary household",
      inviteCode: "PRIMARY",
      ownerId,
      allowance: 50,
      allowanceCents: 5_000n,
      timeZone: "America/New_York",
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });
    await ctx.db.patch(ownerId, { householdId });

    return { householdId, ownerId };
  });
}

test("returns one exact home summary from bounded rollups and corrected reserve days", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  const cameraId = await t.run(async (ctx) => {
    await ctx.db.insert("dailyBudgetRollups", {
      householdId: seeded.householdId,
      localDate: "2026-03-05",
      expenseCents: 4_000n,
      reserveFundedExpenseCents: 1_000n,
      budgetImpactExpenseCents: 3_000n,
      updatedAt: 0,
    });
    await ctx.db.insert("dailyBudgetRollups", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      expenseCents: 7_000n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 7_000n,
      updatedAt: 0,
    });
    await ctx.db.insert("goalReserveDays", {
      householdId: seeded.householdId,
      localDate: "2026-03-05",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 3_000n,
      contributionCents: 2_000n,
      closedAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("goalReserveDays", {
      householdId: seeded.householdId,
      localDate: "2026-03-06",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 5_500n,
      contributionCents: -500n,
      closedAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("goalReserveStates", {
      householdId: seeded.householdId,
      positionCents: 6_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-01",
      updatedAt: 0,
    });
    const cameraId = await ctx.db.insert("wantItems", {
      householdId: seeded.householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "plan_for_it",
      order: 0,
      createdBy: seeded.ownerId,
      updatedBy: seeded.ownerId,
      createdAt: 0,
      updatedAt: 0,
    });

    return cameraId;
  });

  const summary = await t
    .withIdentity({ tokenIdentifier: "test|owner" })
    .query(api.budget.getHomeSummary, {
      from: marchStartNewYork,
      to: aprilStartNewYork,
      now: march10AtNoonNewYork,
    });

  expect(summary).toMatchObject({
    dailyAllowanceCents: 5_000n,
    planAllowanceCents: 150_000n,
    expenseCents: 11_000n,
    reserveFundedExpenseCents: 1_000n,
    budgetImpactExpenseCents: 10_000n,
    currentPlanSetAsideCents: 2_000n,
    safeToSpendCents: 138_000n,
    todayExpenseCents: 7_000n,
    todayBudgetImpactExpenseCents: 7_000n,
    positionCents: 6_000n,
    availableReserveCents: 4_000n,
    recoveryAmountCents: 0n,
    liveNegativeAdjustmentCents: -2_000n,
    potentialTonightCents: 0n,
    elapsedDays: 10,
    averageDailySpendCents: 1_000n,
    varianceCents: 40_000n,
    topItem: {
      itemId: cameraId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      allocatedCents: 4_000n,
      remainingCents: 6_000n,
      progressBasisPoints: 4_000,
    },
  });
});

test("rejects a 32nd monthly rollup as a corrupted month invariant", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    for (let index = 0; index < 32; index += 1) {
      await ctx.db.insert("dailyBudgetRollups", {
        householdId: seeded.householdId,
        localDate: "2026-03-10",
        expenseCents: 1n,
        reserveFundedExpenseCents: 0n,
        budgetImpactExpenseCents: 1n,
        updatedAt: index,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "test|owner" }).query(api.budget.getHomeSummary, {
      from: marchStartNewYork,
      to: aprilStartNewYork,
      now: march10AtNoonNewYork,
    }),
  ).rejects.toThrow("Daily budget rollups exceed the monthly invariant");
});

test("marks want purchases and returns exact reserve and budget-impact cents", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    const wantItemId = await ctx.db.insert("wantItems", {
      householdId: seeded.householdId,
      name: "Camera",
      estimatedCostCents: 12_000n,
      priority: "high",
      notes: "",
      status: "bought",
      createdBy: seeded.ownerId,
      updatedBy: seeded.ownerId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Camera",
      notes: "",
      amount: 120,
      amountCents: 12_000n,
      reserveUsedCents: 10_000n,
      wantItemId,
      date: march10AtNoonNewYork,
    });
  });

  const transactions = await t
    .withIdentity({ tokenIdentifier: "test|owner" })
    .query(api.expenses.listMonthlyTransactions, {
      from: marchStartNewYork,
      to: aprilStartNewYork,
    });

  expect(transactions).toEqual([
    expect.objectContaining({
      type: "expense",
      amountCents: 12_000n,
      reserveUsedCents: 10_000n,
      budgetImpactCents: 2_000n,
      isWantPurchase: true,
    }),
  ]);
});
