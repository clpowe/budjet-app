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
    const days = await ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const entries = await ctx.db
      .query("goalReserveLedgerEntries")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();

    return { household, state, days, entries };
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

  expect(closed.state).toMatchObject({
    positionCents: 4_500n,
    firstEligibleLocalDate: "2026-01-31",
    lastClosedLocalDate: "2026-02-02",
  });
  expect(closed.days).toEqual([
    expect.objectContaining({
      localDate: "2026-01-31",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 3_000n,
      contributionCents: 2_000n,
    }),
    expect.objectContaining({
      localDate: "2026-02-01",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 5_500n,
      contributionCents: -500n,
    }),
    expect.objectContaining({
      localDate: "2026-02-02",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 2_000n,
      contributionCents: 3_000n,
    }),
  ]);
  expect(closed.days.some((day) => day.localDate === "2026-01-30")).toBe(false);
  expect(
    closed.entries
      .filter((entry) => entry.kind === "daily_close")
      .map((entry) => [entry.localDate, entry.amountCents]),
  ).toEqual([
    ["2026-01-31", 2_000n],
    ["2026-02-01", -500n],
    ["2026-02-02", 3_000n],
  ]);
  expect(closed.entries.reduce((sum, entry) => sum + entry.amountCents, 0n)).toBe(
    closed.state?.positionCents,
  );

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
  expect(closed.days.map((day) => day.localDate)).toEqual(["2026-01-31", "2026-02-01"]);
});

test("two closers produce one finalized day, one ledger entry, and one position update", async () => {
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

  expect(closed.state?.positionCents).toBe(2_000n);
  expect(closed.days).toHaveLength(1);
  expect(closed.days[0]).toMatchObject({
    localDate: "2026-01-31",
    contributionCents: 2_000n,
  });
  expect(closed.entries.filter((entry) => entry.kind === "daily_close")).toHaveLength(1);
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

  expect(closed.days).toEqual([
    expect.objectContaining({
      localDate: "2026-03-01",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_000n,
      spendingSnapshotCents: 3_000n,
      contributionCents: 2_000n,
    }),
  ]);
  expect(closed.household).toMatchObject({
    timeZone: "Asia/Tokyo",
  });
  expect(closed.household?.pendingTimeZone).toBeUndefined();
  expect(closed.household?.pendingTimeZoneEffectiveAt).toBeUndefined();
});
