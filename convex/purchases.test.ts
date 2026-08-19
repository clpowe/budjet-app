/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const serverNow = Date.UTC(2026, 2, 10, 16);
const purchaseLocalDate = "2026-03-10";

afterEach(() => {
  vi.useRealTimers();
});

type SeedOptions = {
  allowanceCents?: bigint;
  estimatedCostCents?: bigint;
  positionCents?: bigint;
  firstEligibleLocalDate?: string;
  lastClosedLocalDate?: string | null;
};

async function seedPurchaseHouseholds(
  t: TestConvex<typeof schema>,
  {
    allowanceCents = 5_000n,
    estimatedCostCents = 10_000n,
    positionCents = 10_000n,
    firstEligibleLocalDate = "2026-03-09",
    lastClosedLocalDate = "2026-03-09",
  }: SeedOptions = {},
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: 0,
    });
    const otherOwnerId = await ctx.db.insert("users", {
      identityKey: "test|other",
      email: "other@example.com",
      role: "owner",
      createdAt: 0,
    });

    const householdId = await ctx.db.insert("households", {
      name: "Primary household",
      inviteCode: "PRIMARY",
      ownerId,
      allowance: Number(allowanceCents) / 100,
      allowanceCents,
      timeZone: "America/New_York",
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });
    const otherHouseholdId = await ctx.db.insert("households", {
      name: "Other household",
      inviteCode: "OTHER",
      ownerId: otherOwnerId,
      allowance: Number(allowanceCents) / 100,
      allowanceCents,
      timeZone: "America/New_York",
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });
    await ctx.db.patch(otherOwnerId, { householdId: otherHouseholdId });

    const cameraId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Camera",
      estimatedCostCents,
      priority: "high",
      notes: "",
      status: "plan_for_it",
      order: 0,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 1,
      updatedAt: 1,
    });
    const tripId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Trip",
      estimatedCostCents: 8_000n,
      priority: "medium",
      notes: "",
      status: "plan_for_it",
      order: 1,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 2,
      updatedAt: 2,
    });

    await ctx.db.insert("wantItems", {
      householdId: otherHouseholdId,
      name: "Other camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "plan_for_it",
      order: 0,
      createdBy: otherOwnerId,
      updatedBy: otherOwnerId,
      createdAt: 3,
      updatedAt: 3,
    });

    await ctx.db.insert("goalReserveStates", {
      householdId,
      positionCents,
      activatedAt: 0,
      firstEligibleLocalDate,
      ...(lastClosedLocalDate === null ? {} : { lastClosedLocalDate }),
      updatedAt: 0,
    });
    await ctx.db.insert("goalReserveLedgerEntries", {
      householdId,
      kind: "activation",
      amountCents: 0n,
      localDate: "2026-03-08",
      actorId: ownerId,
      createdAt: 0,
    });

    if (positionCents !== 0n) {
      await ctx.db.insert("goalReserveLedgerEntries", {
        householdId,
        kind: "daily_close",
        amountCents: positionCents,
        localDate: "2026-03-09",
        allowanceSnapshotCents: allowanceCents,
        spendingSnapshotCents: 0n,
        createdAt: 0,
      });
    }

    return {
      householdId,
      otherHouseholdId,
      ownerId,
      otherOwnerId,
      cameraId,
      tripId,
    };
  });
}

type SeededPurchase = Awaited<ReturnType<typeof seedPurchaseHouseholds>>;

async function readSnapshot(
  t: TestConvex<typeof schema>,
  householdId: SeededPurchase["householdId"],
) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();
    const entries = await ctx.db
      .query("goalReserveLedgerEntries")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const days = await ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const rollups = await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const wants = await ctx.db
      .query("wantItems")
      .withIndex("by_household_and_status", (q) => q.eq("householdId", householdId))
      .collect();

    return { state, expenses, entries, days, rollups, wants };
  });
}

type PurchaseSnapshot = Awaited<ReturnType<typeof readSnapshot>>;

function expectLedgerInvariant(snapshot: PurchaseSnapshot): void {
  if (!snapshot.state) {
    throw new Error("Expected a reserve state");
  }

  expect(snapshot.entries.reduce((sum, entry) => sum + entry.amountCents, 0n)).toBe(
    snapshot.state.positionCents,
  );
}

test.each([
  {
    name: "fully funds an estimate-matching purchase",
    estimateCents: 10_000n,
    actualAmountCents: 10_000n,
    availableReserveCents: 10_000n,
    reserveUsedCents: 10_000n,
    budgetImpactCents: 0n,
  },
  {
    name: "partially funds an over-estimate purchase",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableReserveCents: 10_000n,
    reserveUsedCents: 10_000n,
    budgetImpactCents: 2_000n,
  },
  {
    name: "fully funds an over-estimate purchase when reserve is available",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableReserveCents: 15_000n,
    reserveUsedCents: 12_000n,
    budgetImpactCents: 0n,
  },
  {
    name: "uses the ordinary budget when no reserve is available",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableReserveCents: 0n,
    reserveUsedCents: 0n,
    budgetImpactCents: 12_000n,
  },
])(
  "$name",
  async ({
    estimateCents,
    actualAmountCents,
    availableReserveCents,
    reserveUsedCents,
    budgetImpactCents,
  }) => {
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);

    const t = convexTest(schema, modules);
    const seeded = await seedPurchaseHouseholds(t, {
      estimatedCostCents: estimateCents,
      positionCents: availableReserveCents,
    });
    const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

    await asOwner.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents,
      purchaseLocalDate,
    });

    const snapshot = await readSnapshot(t, seeded.householdId);
    const expense = snapshot.expenses.find((candidate) => candidate.wantItemId === seeded.cameraId);
    const purchaseEntry = snapshot.entries.find(
      (entry) => entry.kind === "purchase" && entry.wantItemId === seeded.cameraId,
    );
    const rollup = snapshot.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);
    const camera = snapshot.wants.find((item) => item._id === seeded.cameraId);
    const trip = snapshot.wants.find((item) => item._id === seeded.tripId);

    expect(snapshot.expenses).toHaveLength(1);
    expect(expense).toMatchObject({
      householdId: seeded.householdId,
      name: "Camera",
      amountCents: actualAmountCents,
      wantItemId: seeded.cameraId,
      reserveUsedCents,
    });
    expect(purchaseEntry).toMatchObject({
      householdId: seeded.householdId,
      amountCents: -reserveUsedCents,
      localDate: purchaseLocalDate,
      sourceExpenseId: expense?._id,
      wantItemId: seeded.cameraId,
      actorId: seeded.ownerId,
    });
    expect(snapshot.state?.positionCents).toBe(availableReserveCents - reserveUsedCents);
    expect(camera).toMatchObject({
      status: "bought",
      purchasedBy: seeded.ownerId,
      purchasedAt: serverNow,
      expenseId: expense?._id,
      updatedBy: seeded.ownerId,
    });
    expect(camera?.order).toBeUndefined();
    expect(trip).toMatchObject({
      status: "plan_for_it",
      order: 0,
    });
    expect(rollup).toMatchObject({
      expenseCents: actualAmountCents,
      reserveFundedExpenseCents: reserveUsedCents,
      budgetImpactExpenseCents: budgetImpactCents,
    });

    expectLedgerInvariant(snapshot);
  },
);

test("previews and commits progress consumed from a lower queue item", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 15_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const before = await asOwner.query(api.reserve.getSummary, {
    now: serverNow,
  });
  const preview = await asOwner.query(api.wants.previewPurchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    now: serverNow,
  });

  expect(before.activeAllocations).toEqual([
    expect.objectContaining({
      itemId: seeded.cameraId,
      allocatedCents: 10_000n,
    }),
    expect.objectContaining({
      itemId: seeded.tripId,
      allocatedCents: 5_000n,
    }),
  ]);
  expect(preview).toMatchObject({
    reserveUsedCents: 12_000n,
    budgetImpactCents: 0n,
    lowerItemImpacts: [
      {
        itemId: seeded.tripId,
        name: "Trip",
        lostCents: 2_000n,
        allocatedCentsAfter: 3_000n,
      },
    ],
  });

  await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const after = await asOwner.query(api.reserve.getSummary, {
    now: serverNow,
  });

  expect(after).toMatchObject({
    positionCents: 3_000n,
    availableReserveCents: 3_000n,
    activeAllocations: [
      {
        itemId: seeded.tripId,
        allocatedCents: 3_000n,
        remainingCents: 5_000n,
        progressBasisPoints: 3_750,
      },
    ],
  });
});

test("recalculates funding from current server state instead of trusting a stale preview", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 15_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const preview = await asOwner.query(api.wants.previewPurchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    now: serverNow,
  });

  expect(preview).toMatchObject({
    reserveUsedCents: 12_000n,
    budgetImpactCents: 0n,
  });

  await asOwner.mutation(api.expenses.createExpense, {
    name: "Unexpected repair",
    notes: "",
    amountCents: 10_000n,
    date: serverNow,
  });

  await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const snapshot = await readSnapshot(t, seeded.householdId);
  const purchaseExpense = snapshot.expenses.find(
    (expense) => expense.wantItemId === seeded.cameraId,
  );

  expect(purchaseExpense).toMatchObject({
    amountCents: 12_000n,
    reserveUsedCents: 10_000n,
  });
  expect((purchaseExpense?.amountCents ?? 0n) - (purchaseExpense?.reserveUsedCents ?? 0n)).toBe(
    2_000n,
  );
  expect(snapshot.state?.positionCents).toBe(5_000n);
  expectLedgerInvariant(snapshot);
});

test("serializes competing purchases so the same reserve cannot be spent twice", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await Promise.all([
    asOwner.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
    asOwner.mutation(api.wants.purchase, {
      itemId: seeded.tripId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
  ]);

  const snapshot = await readSnapshot(t, seeded.householdId);
  const purchaseExpenses = snapshot.expenses.filter((expense) => expense.wantItemId !== undefined);
  const purchaseEntries = snapshot.entries.filter((entry) => entry.kind === "purchase");

  expect(purchaseExpenses).toHaveLength(2);
  expect(
    purchaseExpenses.reduce((sum, expense) => sum + (expense.reserveUsedCents ?? 0n), 0n),
  ).toBe(10_000n);
  expect(purchaseEntries).toHaveLength(2);
  expect(purchaseEntries.reduce((sum, entry) => sum + entry.amountCents, 0n)).toBe(-10_000n);
  expect(snapshot.state?.positionCents).toBe(0n);
  expect(
    snapshot.wants
      .filter((item) => item._id === seeded.cameraId || item._id === seeded.tripId)
      .map((item) => item.status),
  ).toEqual(["bought", "bought"]);

  expectLedgerInvariant(snapshot);
});

test("blocks cross-household, future-date, and client-timed purchases", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const asOther = t.withIdentity({ tokenIdentifier: "test|other" });

  await expect(
    asOther.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
  ).rejects.toThrow("Want item not found");

  await expect(
    asOwner.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate: "2026-03-11",
    }),
  ).rejects.toThrow();

  await expect(
    asOwner.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
      // @ts-expect-error Purchase mutations must never accept client time.
      now: serverNow + 86_400_000,
    }),
  ).rejects.toThrow();

  const snapshot = await readSnapshot(t, seeded.householdId);

  expect(snapshot.expenses).toEqual([]);
  expect(snapshot.state?.positionCents).toBe(10_000n);
  expect(snapshot.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "plan_for_it",
  });
  expectLedgerInvariant(snapshot);
});

test("commits only bounded catch-up work while the reserve is still syncing", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 0n,
    firstEligibleLocalDate: "2026-01-01",
    lastClosedLocalDate: null,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const result = await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 10_000n,
    purchaseLocalDate,
  });

  expect(result).toEqual({ status: "reserve_syncing" });

  const syncing = await readSnapshot(t, seeded.householdId);

  expect(syncing.days).toHaveLength(31);
  expect(syncing.entries.filter((entry) => entry.kind === "daily_close")).toHaveLength(31);
  expect(syncing.state).toMatchObject({
    positionCents: 155_000n,
    lastClosedLocalDate: "2026-01-31",
  });
  expect(syncing.expenses).toEqual([]);
  expect(syncing.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "plan_for_it",
  });
  expectLedgerInvariant(syncing);

  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 10_000n,
    purchaseLocalDate,
  });

  const completed = await readSnapshot(t, seeded.householdId);

  expect(completed.expenses).toHaveLength(1);
  expect(completed.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "bought",
  });
  expectLedgerInvariant(completed);
});

test("a purchase racing the hourly closer credits and closes each day once", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 0n,
    firstEligibleLocalDate: "2026-03-09",
    lastClosedLocalDate: null,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await Promise.all([
    asOwner.mutation(api.wants.purchase, {
      itemId: seeded.cameraId,
      actualAmountCents: 5_000n,
      purchaseLocalDate,
    }),
    t.mutation(internal.reserveMaintenance.closeEligibleDays, {
      cursor: null,
    }),
  ]);

  const snapshot = await readSnapshot(t, seeded.householdId);
  const dailyCloseEntries = snapshot.entries.filter((entry) => entry.kind === "daily_close");
  const purchaseEntries = snapshot.entries.filter((entry) => entry.kind === "purchase");

  expect(snapshot.days).toEqual([
    expect.objectContaining({
      localDate: "2026-03-09",
      contributionCents: 5_000n,
    }),
  ]);
  expect(dailyCloseEntries).toEqual([
    expect.objectContaining({
      localDate: "2026-03-09",
      amountCents: 5_000n,
    }),
  ]);
  expect(purchaseEntries).toEqual([
    expect.objectContaining({
      wantItemId: seeded.cameraId,
      amountCents: -5_000n,
    }),
  ]);
  expect(snapshot.expenses).toEqual([
    expect.objectContaining({
      wantItemId: seeded.cameraId,
      amountCents: 5_000n,
      reserveUsedCents: 5_000n,
    }),
  ]);
  expect(snapshot.state?.positionCents).toBe(0n);
  expectLedgerInvariant(snapshot);
});

test("corrects the linked purchase in place and recalculates exact funding", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const purchased = await readSnapshot(t, seeded.householdId);
  const originalExpense = purchased.expenses.find(
    (expense) => expense.wantItemId === seeded.cameraId,
  );

  if (!originalExpense) {
    throw new Error("Expected the linked purchase expense");
  }

  await asOwner.mutation(api.wants.correctPurchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 8_000n,
  });

  const corrected = await readSnapshot(t, seeded.householdId);
  const correctedExpense = corrected.expenses.find(
    (expense) => expense.wantItemId === seeded.cameraId,
  );
  const correctionEntries = corrected.entries.filter((entry) => entry.kind === "correction");
  const rollup = corrected.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);

  expect(corrected.expenses).toHaveLength(1);
  expect(correctedExpense).toMatchObject({
    _id: originalExpense._id,
    amountCents: 8_000n,
    reserveUsedCents: 8_000n,
    wantItemId: seeded.cameraId,
  });
  expect(correctionEntries).toContainEqual(
    expect.objectContaining({
      amountCents: 2_000n,
      sourceExpenseId: originalExpense._id,
      wantItemId: seeded.cameraId,
      actorId: seeded.ownerId,
    }),
  );
  expect(rollup).toMatchObject({
    expenseCents: 8_000n,
    reserveFundedExpenseCents: 8_000n,
    budgetImpactExpenseCents: 0n,
  });
  expect(corrected.state?.positionCents).toBe(2_000n);
  expect(corrected.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "bought",
    expenseId: originalExpense._id,
  });
  expectLedgerInvariant(corrected);
});

test("undoes a purchase, reverses its rollup, and restores the item at the queue bottom", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.wants.purchase, {
    itemId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const purchased = await readSnapshot(t, seeded.householdId);
  const originalExpense = purchased.expenses.find(
    (expense) => expense.wantItemId === seeded.cameraId,
  );

  if (!originalExpense) {
    throw new Error("Expected the linked purchase expense");
  }

  await asOwner.mutation(api.wants.undoPurchase, {
    itemId: seeded.cameraId,
  });

  const undone = await readSnapshot(t, seeded.householdId);
  const camera = undone.wants.find((item) => item._id === seeded.cameraId);
  const trip = undone.wants.find((item) => item._id === seeded.tripId);
  const purchaseUndoEntries = undone.entries.filter((entry) => entry.kind === "purchase_undo");
  const rollup = undone.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);

  expect(undone.expenses).toEqual([]);
  expect(purchaseUndoEntries).toEqual([
    expect.objectContaining({
      amountCents: 10_000n,
      localDate: purchaseLocalDate,
      sourceExpenseId: originalExpense._id,
      wantItemId: seeded.cameraId,
      actorId: seeded.ownerId,
    }),
  ]);
  expect(rollup).toMatchObject({
    expenseCents: 0n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 0n,
  });
  expect(undone.state?.positionCents).toBe(10_000n);
  expect(trip).toMatchObject({
    status: "plan_for_it",
    order: 0,
  });
  expect(camera).toMatchObject({
    status: "plan_for_it",
    order: 1,
    updatedBy: seeded.ownerId,
  });
  expect(camera?.purchasedBy).toBeUndefined();
  expect(camera?.purchasedAt).toBeUndefined();
  expect(camera?.expenseId).toBeUndefined();
  expectLedgerInvariant(undone);
});
