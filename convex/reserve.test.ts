/// <reference types="vite/client" />

import { afterEach, expect, test, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
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

async function readReserve(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedHousehold>>["householdId"],
) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();
    const entries = await ctx.db
      .query("goalReserveLedgerEntries")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();

    return { state, entries };
  });
}

test("requires completed money migration before activating the reserve", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t, { moneyMigrationComplete: false });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const result = await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.cameraId,
    status: "plan_for_it",
  });

  expect(result).toEqual({ kind: "money_migration_pending" });
  expect(await readReserve(t, seeded.householdId)).toEqual({
    state: null,
    entries: [],
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

  const activated = await readReserve(t, seeded.householdId);

  expect(activated.state).toMatchObject({
    householdId: seeded.householdId,
    positionCents: 0n,
    activatedAt: march10AtNoonNewYork,
    firstEligibleLocalDate: "2026-03-11",
  });
  expect(activated.entries).toEqual([
    expect.objectContaining({
      householdId: seeded.householdId,
      kind: "activation",
      amountCents: 0n,
      localDate: "2026-03-10",
      actorId: seeded.ownerId,
      createdAt: march10AtNoonNewYork,
    }),
  ]);

  await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.cameraId,
    status: "considering",
  });
  await asOwner.mutation(api.wants.changeStatus, {
    itemId: seeded.headphonesId,
    status: "not_now",
  });

  expect(await readReserve(t, seeded.householdId)).toMatchObject({
    state: activated.state,
    entries: activated.entries,
  });
});

test("reports open-day underspending as potential instead of funded reserve", async () => {
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
    await ctx.db.insert("goalReserveStates", {
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
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 3_000n,
      updatedAt: 0,
    });
  });

  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const summary = await asOwner.query(api.reserve.getSummary, {
    now: march10AtNoonNewYork,
  });

  expect(summary).toMatchObject({
    positionCents: 3_000n,
    availableReserveCents: 3_000n,
    recoveryAmountCents: 0n,
    liveNegativeAdjustmentCents: 0n,
    potentialTonightCents: 2_500n,
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
    topItem: {
      itemId: seeded.cameraId,
      name: "Camera",
      estimatedCostCents: 5_000n,
      allocatedCents: 3_000n,
      remainingCents: 2_000n,
      progressBasisPoints: 6_000,
    },
  });
});

test("immediately reduces visible progress when open-day spending exceeds allowance", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);

  await t.run(async (ctx) => {
    await ctx.db.patch(seeded.cameraId, {
      status: "plan_for_it",
      order: 0,
    });
    await ctx.db.insert("goalReserveStates", {
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
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 7_000n,
      updatedAt: 0,
    });
  });

  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const summary = await asOwner.query(api.reserve.getSummary, {
    now: march10AtNoonNewYork,
  });

  expect(summary).toMatchObject({
    positionCents: 1_000n,
    availableReserveCents: 0n,
    recoveryAmountCents: 500n,
    liveNegativeAdjustmentCents: -1_500n,
    potentialTonightCents: 0n,
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
