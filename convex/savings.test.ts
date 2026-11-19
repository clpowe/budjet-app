/// <reference types="vite/client" />

import { afterEach, expect, test, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import { reduceSavingsEvent } from "./lib/savings_account";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const march10AtNoonNewYork = Date.UTC(2026, 2, 10, 16);

afterEach(() => {
  vi.useRealTimers();
});

async function seedHousehold(
  t: TestConvex<typeof schema>,
  options: { moneyMigrationComplete?: boolean } = {},
) {
  const moneyMigrationComplete = options.moneyMigrationComplete ?? true;

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
      allowance: 55,
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      ...(moneyMigrationComplete ? { moneyMigrationCompletedAt: 0 } : {}),
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });

    const cameraId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Camera",
      estimatedCostCents: 5_000n,
      priority: "high",
      notes: "",
      status: "considering",
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 0,
      updatedAt: 0,
    });
    const headphonesId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Headphones",
      estimatedCostCents: 4_000n,
      priority: "medium",
      notes: "",
      status: "considering",
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 0,
      updatedAt: 0,
    });

    return { householdId, ownerId, cameraId, headphonesId };
  });
}

async function readSavings(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedHousehold>>["householdId"],
) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("goalSavingsStates")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();
    return { state };
  });
}

test("requires completed money migration before activating the savings", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t, { moneyMigrationComplete: false });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const result = await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.cameraId,
    status: "plan_for_it",
  });

  expect(result).toEqual({ kind: "money_migration_pending" });
  expect(await readSavings(t, seeded.householdId)).toEqual({
    state: null,
  });
});

test("activates exactly once at zero and preserves the state after the queue empties", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march10AtNoonNewYork);

  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const firstResult = await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.cameraId,
    status: "plan_for_it",
  });
  const secondResult = await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.headphonesId,
    status: "plan_for_it",
  });

  expect(firstResult.kind).toBe("updated");
  expect(secondResult.kind).toBe("updated");

  const activated = await readSavings(t, seeded.householdId);

  expect(activated.state).toMatchObject({
    householdId: seeded.householdId,
    positionCents: 0n,
    activatedAt: march10AtNoonNewYork,
    firstEligibleLocalDate: "2026-03-11",
  });

  await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.cameraId,
    status: "considering",
  });
  await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.headphonesId,
    status: "not_now",
  });

  expect(await readSavings(t, seeded.householdId)).toMatchObject({
    state: activated.state,
  });
});

test("savings transitions reject invalid amounts and stale daily closes", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);
  const state = await t.run(async (ctx) => {
    const stateId = await ctx.db.insert("goalSavingsStates", {
      householdId: seeded.householdId,
      positionCents: 3_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-10",
      lastClosedLocalDate: "2026-03-11",
      updatedAt: 0,
    });
    return await ctx.db.get("goalSavingsStates", stateId);
  });

  if (!state) {
    throw new Error("Expected savings state");
  }

  expect(() =>
    reduceSavingsEvent(state, {
      kind: "daily_close",
      localDate: "2026-03-11",
      allowanceCents: 5_500n,
      spendingCents: 1_000n,
    }),
  ).toThrow("Savings days must close after the recorded close cursor");

  expect(() => reduceSavingsEvent(state, { kind: "purchase", savingsUsedCents: -1n })).toThrow(
    "Paid from savings must not be negative",
  );
});

test("reports open-day underspending as potential instead of funded savings", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    await ctx.db.patch(seeded.cameraId, {
      status: "plan_for_it",
      order: 0,
    });
    await ctx.db.patch(seeded.headphonesId, {
      status: "plan_for_it",
      order: 1,
    });
    await ctx.db.insert("goalSavingsStates", {
      householdId: seeded.householdId,
      positionCents: 3_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-01",
      updatedAt: 0,
    });
    await ctx.db.insert("dailyBudgetRollups", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      expenseCents: 3_000n,
      savingsFundedExpenseCents: 0n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 3_000n,
      updatedAt: 0,
    });
  });

  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const summary = await asOwner.query(api.savings.getSummary, {
    now: march10AtNoonNewYork,
  });

  expect(summary).toMatchObject({
    positionCents: 3_000n,
    availableSavingsCents: 3_000n,
    recoveryAmountCents: 0n,
    todayOverageAdjustmentCents: 0n,
    projectedEndOfDayContributionCents: 2_500n,
    activeAllocations: [
      {
        itemId: seeded.cameraId,
        allocatedCents: 3_000n,
        remainingCents: 2_000n,
        progressBasisPoints: 6_000,
      },
      {
        itemId: seeded.headphonesId,
        allocatedCents: 0n,
        remainingCents: 4_000n,
        progressBasisPoints: 0,
      },
    ],
  });

  expect(summary).not.toHaveProperty("nextPlannedWant");
});

test("immediately reduces visible progress when open-day spending exceeds allowance", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    await ctx.db.patch(seeded.cameraId, {
      status: "plan_for_it",
      order: 0,
    });
    await ctx.db.insert("goalSavingsStates", {
      householdId: seeded.householdId,
      positionCents: 1_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-01",
      updatedAt: 0,
    });
    await ctx.db.insert("dailyBudgetRollups", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      expenseCents: 7_000n,
      savingsFundedExpenseCents: 0n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 7_000n,
      updatedAt: 0,
    });
  });

  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const summary = await asOwner.query(api.savings.getSummary, {
    now: march10AtNoonNewYork,
  });

  expect(summary).toMatchObject({
    positionCents: 1_000n,
    availableSavingsCents: 0n,
    recoveryAmountCents: 500n,
    todayOverageAdjustmentCents: -1_500n,
    projectedEndOfDayContributionCents: 0n,
    activeAllocations: [
      {
        itemId: seeded.cameraId,
        allocatedCents: 0n,
        remainingCents: 5_000n,
        progressBasisPoints: 0,
      },
    ],
  });
});
