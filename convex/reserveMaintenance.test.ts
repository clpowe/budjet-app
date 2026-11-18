/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type ReserveSeedOptions = {
  allowanceCents?: bigint;
  firstEligibleLocalDate?: string;
  lastClosedLocalDate?: string;
  timeZone?: string;
  pendingTimeZone?: string;
  pendingTimeZoneEffectiveAt?: number;
};

async function seedReserve(
  t: TestConvex<typeof schema>,
  {
    allowanceCents = 5_000n,
    firstEligibleLocalDate = "2026-01-31",
    lastClosedLocalDate,
    timeZone = "America/New_York",
    pendingTimeZone,
    pendingTimeZoneEffectiveAt,
  }: ReserveSeedOptions = {},
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: 0,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Reserve household",
      inviteCode: "RESERVE",
      ownerId,
      allowance: Number(allowanceCents) / 100,
      allowanceCents,
      timeZone,
      ...(pendingTimeZone ? { pendingTimeZone } : {}),
      ...(pendingTimeZoneEffectiveAt !== undefined ? { pendingTimeZoneEffectiveAt } : {}),
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });

    await ctx.db.insert("goalReserveStates", {
      householdId,
      positionCents: 0n,
      activatedAt: 0,
      firstEligibleLocalDate,
      ...(lastClosedLocalDate ? { lastClosedLocalDate } : {}),
      updatedAt: 0,
    });

    return { householdId };
  });
}

async function addRollup(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedReserve>>["householdId"],
  localDate: string,
  budgetImpactExpenseCents: bigint,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("dailyBudgetRollups", {
      householdId,
      localDate,
      expenseCents: budgetImpactExpenseCents,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents,
      updatedAt: 0,
    });
  });
}

async function readReserve(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedReserve>>["householdId"],
) {
  return await t.run(async (ctx) => {
    const household = await ctx.db.get(householdId);
    const state = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();
    return { household, state };
  });
}

test("closes eligible days exactly across a month boundary and is idempotent", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReserve(t);

  await addRollup(t, seeded.householdId, "2026-01-30", 0n);
  await addRollup(t, seeded.householdId, "2026-01-31", 3_000n);
  await addRollup(t, seeded.householdId, "2026-02-01", 5_500n);
  await addRollup(t, seeded.householdId, "2026-02-02", 2_000n);

  const result = await t.mutation(internal.reserveMaintenance.closeThrough, {
    householdId: seeded.householdId,
    throughExclusiveTimestamp: Date.UTC(2026, 1, 3, 17),
    maxDays: 31,
  });

  expect(result).toEqual({
    complete: true,
    lastClosedLocalDate: "2026-02-02",
  });

  const closed = await readReserve(t, seeded.householdId);

  // 2_000 + (−500) + 3_000; January 30 is before the first eligible day.
  expect(closed.state).toMatchObject({
    positionCents: 4_500n,
    firstEligibleLocalDate: "2026-01-31",
    lastClosedLocalDate: "2026-02-02",
  });

  await t.mutation(internal.reserveMaintenance.closeThrough, {
    householdId: seeded.householdId,
    throughExclusiveTimestamp: Date.UTC(2026, 1, 3, 17),
    maxDays: 31,
  });

  expect(await readReserve(t, seeded.householdId)).toEqual(closed);
});

test("stops at the caller's bounded day count", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReserve(t);

  await addRollup(t, seeded.householdId, "2026-01-31", 3_000n);
  await addRollup(t, seeded.householdId, "2026-02-01", 3_000n);
  await addRollup(t, seeded.householdId, "2026-02-02", 3_000n);

  const result = await t.mutation(internal.reserveMaintenance.closeThrough, {
    householdId: seeded.householdId,
    throughExclusiveTimestamp: Date.UTC(2026, 1, 3, 17),
    maxDays: 2,
  });

  expect(result).toEqual({
    complete: false,
    lastClosedLocalDate: "2026-02-01",
  });

  const closed = await readReserve(t, seeded.householdId);

  expect(closed.state).toMatchObject({
    positionCents: 4_000n,
    lastClosedLocalDate: "2026-02-01",
  });
});

test("two closers credit the day once", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReserve(t);

  await addRollup(t, seeded.householdId, "2026-01-31", 3_000n);

  await Promise.all([
    t.mutation(internal.reserveMaintenance.closeThrough, {
      householdId: seeded.householdId,
      throughExclusiveTimestamp: Date.UTC(2026, 1, 1, 17),
      maxDays: 31,
    }),
    t.mutation(internal.reserveMaintenance.closeThrough, {
      householdId: seeded.householdId,
      throughExclusiveTimestamp: Date.UTC(2026, 1, 1, 17),
      maxDays: 31,
    }),
  ]);

  const closed = await readReserve(t, seeded.householdId);

  expect(closed.state).toMatchObject({
    positionCents: 2_000n,
    lastClosedLocalDate: "2026-01-31",
  });
});

test("closes the final old-timezone day before promoting a pending timezone", async () => {
  const pendingTimeZoneEffectiveAt = Date.UTC(2026, 2, 2, 5);
  const t = convexTest(schema, modules);
  const seeded = await seedReserve(t, {
    firstEligibleLocalDate: "2026-03-01",
    lastClosedLocalDate: "2026-02-28",
    timeZone: "America/New_York",
    pendingTimeZone: "Asia/Tokyo",
    pendingTimeZoneEffectiveAt,
  });

  await addRollup(t, seeded.householdId, "2026-03-01", 3_000n);

  const result = await t.mutation(internal.reserveMaintenance.closeThrough, {
    householdId: seeded.householdId,
    throughExclusiveTimestamp: Date.UTC(2026, 2, 2, 12),
    maxDays: 31,
  });

  expect(result).toEqual({
    complete: true,
    lastClosedLocalDate: "2026-03-01",
  });

  const closed = await readReserve(t, seeded.householdId);

  expect(closed.state).toMatchObject({
    positionCents: 2_000n,
    lastClosedLocalDate: "2026-03-01",
  });
  expect(closed.household).toMatchObject({
    timeZone: "Asia/Tokyo",
  });
  expect(closed.household?.pendingTimeZone).toBeUndefined();
  expect(closed.household?.pendingTimeZoneEffectiveAt).toBeUndefined();
});
