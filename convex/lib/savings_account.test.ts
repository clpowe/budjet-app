/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { getSavingsSnapshot, sumClosedPositiveContributions } from "./savings_account";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);

test("assembles the live savings snapshot from the household and its rollups", async () => {
  const t = convexTest(schema, modules);

  const snapshot = await t.run(async (ctx) => {
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
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      createdAt: 0,
    });
    // March 9 is the one closed eligible day: $55 earned, $45 spent -> $10 of savings.
    await ctx.db.patch(householdId, { savingsStartLocalDate: "2026-03-09" });
    await ctx.db.insert("dailyBudgetTotals", {
      householdId,
      localDate: "2026-03-09",
      totalSpentCents: 4_500n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });

    await ctx.db.insert("dailyBudgetTotals", {
      householdId,
      localDate: "2026-03-10",
      totalSpentCents: 7_000n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });

    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    const result = await getSavingsSnapshot(ctx, household, march10AtNoonNewYork);

    return { result };
  });

  expect(snapshot.result).toMatchObject({
    firstEligibleLocalDate: "2026-03-09",
    timeZone: "America/New_York",
    localDate: "2026-03-10",
    dailyAllowanceCents: 5_500n,
    positionCents: 1_000n,
    budgetImpactExpenseCents: 7_000n,
    availableCents: 0n,
    shortfallCents: 500n,
    todayOverageAdjustmentCents: -1_500n,
    projectedEndOfDayContributionCents: 0n,
  });
});

test("defaults inactive savings and a missing current rollup to zero", async () => {
  const t = convexTest(schema, modules);

  const snapshot = await t.run(async (ctx) => {
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
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      createdAt: 0,
    });
    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    return await getSavingsSnapshot(ctx, household, march10AtNoonNewYork);
  });

  // t.run serializes its result, so an undefined field comes back absent.
  expect(snapshot.firstEligibleLocalDate).toBeUndefined();
  expect(snapshot).toMatchObject({
    positionCents: 0n,
    budgetImpactExpenseCents: 0n,
    availableCents: 0n,
    shortfallCents: 0n,
    todayOverageAdjustmentCents: 0n,
    projectedEndOfDayContributionCents: 5_500n,
  });
});

describe("sumClosedPositiveContributions", () => {
  const base = {
    allowanceCents: 5_000n,
    startLocalDate: "2026-03-01",
    endExclusiveLocalDate: "2026-03-11",
    timeZone: "America/New_York",
  };

  test("adds the full allowance for a closed day without a rollup", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        firstEligibleLocalDate: "2026-03-01",
        todayLocalDate: "2026-03-03",
      }),
    ).toBe(10_000n);
  });

  test("clamps an overspent day to zero instead of subtracting it", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [
          { localDate: "2026-03-01", totalSpentCents: 7_000n, spentFromSavingsCents: 0n },
          { localDate: "2026-03-02", totalSpentCents: 1_000n, spentFromSavingsCents: 0n },
        ],
        firstEligibleLocalDate: "2026-03-01",
        todayLocalDate: "2026-03-03",
      }),
    ).toBe(4_000n);
  });

  test("skips days before the first eligible day", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        firstEligibleLocalDate: "2026-03-09",
        todayLocalDate: "2026-03-11",
      }),
    ).toBe(10_000n);
  });

  test("stops before today and at the range end", () => {
    const days = {
      firstEligibleLocalDate: "2026-02-20",
      todayLocalDate: "2026-03-04",
    };

    expect(sumClosedPositiveContributions({ ...base, rollups: [], ...days })).toBe(15_000n);
    expect(
      sumClosedPositiveContributions({
        ...base,
        endExclusiveLocalDate: "2026-03-02",
        rollups: [],
        ...days,
      }),
    ).toBe(5_000n);
  });

  test("returns zero when savings have not started or today is the first eligible day", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        firstEligibleLocalDate: "2026-03-10",
        todayLocalDate: "2026-03-10",
      }),
    ).toBe(0n);
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        firstEligibleLocalDate: undefined,
        todayLocalDate: "2026-03-10",
      }),
    ).toBe(0n);
  });
});
