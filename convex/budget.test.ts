/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { calculateSafeToSpendCents } from "./budget";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);

describe("calculateSafeToSpendCents", () => {
  test.each([
    {
      scenario: "$30 spent and $20 saved today after close",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 3_000n,
      closedPositiveSavingsContributionCents: 2_000n,
      expected: 145_000n,
    },
    {
      scenario: "$20 of prior-month savings is spent this month",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 0n,
      closedPositiveSavingsContributionCents: 0n,
      expected: 150_000n,
    },
    {
      scenario: "a $120 purchase uses $100 of prior-month savings",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 2_000n,
      closedPositiveSavingsContributionCents: 0n,
      expected: 148_000n,
    },
    {
      scenario: "a closed day is corrected from +$20 to -$5",
      planAllowanceCents: 150_000n,
      budgetImpactExpenseCents: 5_500n,
      closedPositiveSavingsContributionCents: 0n,
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
        closedPositiveSavingsContributionCents: 0n,
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
      allowanceCents: 5_000n,
      timeZone: "America/New_York",
      createdAt: 0,
    });
    await ctx.db.patch(ownerId, { householdId });

    return { householdId, ownerId };
  });
}

test("derives one nested month-to-date summary and excludes future local-date rows", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  const cameraId = await t.run(async (ctx) => {
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-05",
      totalSpentCents: 4_000n,
      spentFromSavingsCents: 1_000n,
      updatedAt: 0,
    });
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      totalSpentCents: 7_000n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-11",
      totalSpentCents: 100_000n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });
    // Only March 9 is a closed eligible day, with no spending: it earns the full $50.
    await ctx.db.patch(seeded.householdId, { savingsStartLocalDate: "2026-03-09" });
    const cameraId = await ctx.db.insert("goals", {
      householdId: seeded.householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "saving",
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
      asOfTimestamp: march10AtNoonNewYork,
    });

  expect(summary).toMatchObject({
    period: {
      localMonth: "2026-03",
      elapsedDays: 10,
    },
    plan: {
      dailyAllowanceCents: 5_000n,
      allowanceCents: 150_000n,
      safeToSpendCents: 135_000n,
      closedPositiveSavingsContributionCents: 5_000n,
    },
    spending: {
      monthToDate: {
        expenseCents: 11_000n,
        savingsFundedCents: 1_000n,
        budgetImpactCents: 10_000n,
        averageDailyBudgetImpactCents: 1_000n,
        budgetImpactVarianceCents: 40_000n,
      },
      today: {
        expenseCents: 7_000n,
        budgetImpactCents: 7_000n,
      },
    },
    savings: {
      positionCents: 5_000n,
      availableCents: 3_000n,
      recoveryCents: 0n,
      todayOverageAdjustmentCents: -2_000n,
      projectedEndOfDayContributionCents: 0n,
    },
    nextPlannedWant: {
      goalId: cameraId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      allocatedCents: 3_000n,
      remainingCents: 7_000n,
      progressBasisPoints: 3_000,
    },
  });
});

test("rejects a 32nd monthly rollup as a corrupted month invariant", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    for (let index = 0; index < 32; index += 1) {
      await ctx.db.insert("dailyBudgetTotals", {
        householdId: seeded.householdId,
        localDate: "2026-03-05",
        totalSpentCents: 1n,
        spentFromSavingsCents: 0n,
        updatedAt: index,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "test|owner" }).query(api.budget.getHomeSummary, {
      asOfTimestamp: march10AtNoonNewYork,
    }),
  ).rejects.toThrow("Daily budget rollups exceed the monthly invariant");
});

test("rejects duplicate monthly rollup local dates below the row cap", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    for (let index = 0; index < 2; index += 1) {
      await ctx.db.insert("dailyBudgetTotals", {
        householdId: seeded.householdId,
        localDate: "2026-03-05",
        totalSpentCents: 1n,
        spentFromSavingsCents: 0n,
        updatedAt: index,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "test|owner" }).query(api.budget.getHomeSummary, {
      asOfTimestamp: march10AtNoonNewYork,
    }),
  ).rejects.toThrow("Daily budget rollups contain duplicate local dates");
});

test("marks want purchases and returns exact savings and budget-impact cents", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    const goalId = await ctx.db.insert("goals", {
      householdId: seeded.householdId,
      name: "Camera",
      estimatedCostCents: 12_000n,
      priority: "high",
      notes: "",
      status: "purchased",
      createdBy: seeded.ownerId,
      updatedBy: seeded.ownerId,
      createdAt: 0,
      updatedAt: 0,
    });
    await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Camera",
      notes: "",
      amountCents: 12_000n,
      fromSavingsCents: 10_000n,
      goalId,
      localDate: "2026-03-10",
    });
  });

  const transactions = await t
    .withIdentity({ tokenIdentifier: "test|owner" })
    .query(api.expenses.listMonthlyTransactions, {
      asOfTimestamp: march10AtNoonNewYork,
    });

  expect(transactions).toEqual([
    expect.objectContaining({
      type: "expense",
      amountCents: 12_000n,
      fromSavingsCents: 10_000n,
      budgetImpactCents: 2_000n,
      isWantPurchase: true,
    }),
  ]);
});
