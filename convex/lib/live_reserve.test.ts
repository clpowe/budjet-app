/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import { getCurrentReserveSnapshot } from "./live_reserve";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);

test("assembles the live reserve snapshot from the household, state, and current rollup", async () => {
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
    const stateId = await ctx.db.insert("goalReserveStates", {
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
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 7_000n,
      updatedAt: 0,
    });

    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    const result = await getCurrentReserveSnapshot(ctx, household, march10AtNoonNewYork);

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

test("defaults missing reserve state and current rollup to zero", async () => {
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

    return await getCurrentReserveSnapshot(ctx, household, march10AtNoonNewYork);
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
