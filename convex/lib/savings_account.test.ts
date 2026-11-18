/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { getSavingsSnapshot, sumClosedPositiveContributions } from "./savings_account";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);

test("assembles the live savings snapshot from the household, state, and current rollup", async () => {
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
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });
    const stateId = await ctx.db.insert("goalSavingsStates", {
      householdId,
      positionCents: 1_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-01",
      updatedAt: 0,
    });

    await ctx.db.insert("dailyBudgetRollups", {
      householdId,
      localDate: "2026-03-10",
      expenseCents: 7_000n,
      savingsFundedExpenseCents: 0n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 7_000n,
      updatedAt: 0,
    });

    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    const result = await getSavingsSnapshot(ctx, household, march10AtNoonNewYork);

    return { result, stateId };
  });

  expect(snapshot.result).toMatchObject({
    state: { _id: snapshot.stateId, positionCents: 1_000n },
    timeZone: "America/New_York",
    localDate: "2026-03-10",
    dailyAllowanceCents: 5_500n,
    positionCents: 1_000n,
    budgetImpactExpenseCents: 7_000n,
    availableCents: 0n,
    recoveryCents: 500n,
    todayOverageAdjustmentCents: -1_500n,
    projectedEndOfDayContributionCents: 0n,
  });
});

test("defaults missing savings state and current rollup to zero", async () => {
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
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });
    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    return await getSavingsSnapshot(ctx, household, march10AtNoonNewYork);
  });

  expect(snapshot).toMatchObject({
    state: null,
    positionCents: 0n,
    budgetImpactExpenseCents: 0n,
    availableCents: 0n,
    recoveryCents: 0n,
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
        state: { firstEligibleLocalDate: "2026-03-01", lastClosedLocalDate: "2026-03-02" },
      }),
    ).toBe(10_000n);
  });

  test("clamps an overspent day to zero instead of subtracting it", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [
          { localDate: "2026-03-01", budgetImpactExpenseCents: 7_000n },
          { localDate: "2026-03-02", budgetImpactExpenseCents: 1_000n },
        ],
        state: { firstEligibleLocalDate: "2026-03-01", lastClosedLocalDate: "2026-03-02" },
      }),
    ).toBe(4_000n);
  });

  test("skips days before the first eligible day", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        state: { firstEligibleLocalDate: "2026-03-09", lastClosedLocalDate: "2026-03-10" },
      }),
    ).toBe(10_000n);
  });

  test("stops at the close cursor and at the range end", () => {
    const state = { firstEligibleLocalDate: "2026-02-20", lastClosedLocalDate: "2026-03-03" };

    expect(sumClosedPositiveContributions({ ...base, rollups: [], state })).toBe(15_000n);
    expect(
      sumClosedPositiveContributions({
        ...base,
        endExclusiveLocalDate: "2026-03-02",
        rollups: [],
        state,
      }),
    ).toBe(5_000n);
  });

  test("returns zero before the first close or without a savings", () => {
    expect(
      sumClosedPositiveContributions({
        ...base,
        rollups: [],
        state: { firstEligibleLocalDate: "2026-03-01" },
      }),
    ).toBe(0n);
    expect(sumClosedPositiveContributions({ ...base, rollups: [], state: null })).toBe(0n);
  });
});
