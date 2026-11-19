/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { getSavingsSnapshot } from "./lib/savings_account";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { getLocalDateKey } from "../shared/utils/local-date";

const modules = import.meta.glob("./**/*.ts");

const serverNow = Date.UTC(2026, 2, 10, 16);
const purchaseLocalDate = "2026-03-10";

afterEach(() => {
  vi.useRealTimers();
});

type SeedOptions = {
  allowanceCents?: bigint;
  estimatedCostCents?: bigint;
  /** Savings position at the start of March 10. Ignored when `firstEligibleLocalDate` is given. */
  positionCents?: bigint;
  /** Start savings on this date with no spending since. */
  firstEligibleLocalDate?: string;
};

/**
 * Starts savings so that, on March 10, `positionCents` is available: enough
 * whole closed days to earn it, with one rollup holding the shortfall.
 */
async function seedSavingsPosition(
  ctx: MutationCtx,
  householdId: Id<"households">,
  allowanceCents: bigint,
  positionCents: bigint,
) {
  const closedDays =
    positionCents > 0n ? (positionCents + allowanceCents - 1n) / allowanceCents : 1n;
  const startLocalDate = getLocalDateKey(
    serverNow - Number(closedDays) * 86_400_000,
    "America/New_York",
  );
  const spentCents = closedDays * allowanceCents - positionCents;

  await ctx.db.patch(householdId, { savingsStartLocalDate: startLocalDate });

  if (spentCents > 0n) {
    await ctx.db.insert("dailyBudgetTotals", {
      householdId,
      localDate: startLocalDate,
      totalSpentCents: spentCents,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });
  }
}

async function seedPurchaseHouseholds(
  t: TestConvex<typeof schema>,
  {
    allowanceCents = 5_000n,
    estimatedCostCents = 10_000n,
    positionCents = 10_000n,
    firstEligibleLocalDate,
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
      allowanceCents,
      timeZone: "America/New_York",
      createdAt: 0,
    });
    const otherHouseholdId = await ctx.db.insert("households", {
      name: "Other household",
      inviteCode: "OTHER",
      ownerId: otherOwnerId,
      allowanceCents,
      timeZone: "America/New_York",
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });
    await ctx.db.patch(otherOwnerId, { householdId: otherHouseholdId });

    const cameraId = await ctx.db.insert("goals", {
      householdId,
      name: "Camera",
      estimatedCostCents,
      priority: "high",
      notes: "",
      status: "saving",
      order: 0,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 1,
      updatedAt: 1,
    });
    const tripId = await ctx.db.insert("goals", {
      householdId,
      name: "Trip",
      estimatedCostCents: 8_000n,
      priority: "medium",
      notes: "",
      status: "saving",
      order: 1,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 2,
      updatedAt: 2,
    });

    await ctx.db.insert("goals", {
      householdId: otherHouseholdId,
      name: "Other camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "saving",
      order: 0,
      createdBy: otherOwnerId,
      updatedBy: otherOwnerId,
      createdAt: 3,
      updatedAt: 3,
    });

    if (firstEligibleLocalDate === undefined) {
      await seedSavingsPosition(ctx, householdId, allowanceCents, positionCents);
    } else {
      await ctx.db.patch(householdId, { savingsStartLocalDate: firstEligibleLocalDate });
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
    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    const savings = await getSavingsSnapshot(ctx, household, Date.now());
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const rollups = await ctx.db
      .query("dailyBudgetTotals")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", householdId))
      .collect();
    const wants = await ctx.db
      .query("goals")
      .withIndex("by_household_and_status", (q) => q.eq("householdId", householdId))
      .collect();

    return { savings, expenses, rollups, wants };
  });
}

test.each([
  {
    name: "fully funds an estimate-matching purchase",
    estimateCents: 10_000n,
    actualAmountCents: 10_000n,
    availableSavingsCents: 10_000n,
    fromSavingsCents: 10_000n,
    budgetImpactCents: 0n,
  },
  {
    name: "partially funds an over-estimate purchase",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableSavingsCents: 10_000n,
    fromSavingsCents: 10_000n,
    budgetImpactCents: 2_000n,
  },
  {
    name: "fully funds an over-estimate purchase when savings is available",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableSavingsCents: 15_000n,
    fromSavingsCents: 12_000n,
    budgetImpactCents: 0n,
  },
  {
    name: "uses the ordinary budget when no savings is available",
    estimateCents: 10_000n,
    actualAmountCents: 12_000n,
    availableSavingsCents: 0n,
    fromSavingsCents: 0n,
    budgetImpactCents: 12_000n,
  },
])(
  "$name",
  async ({
    estimateCents,
    actualAmountCents,
    availableSavingsCents,
    fromSavingsCents,
    budgetImpactCents,
  }) => {
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);

    const t = convexTest(schema, modules);
    const seeded = await seedPurchaseHouseholds(t, {
      estimatedCostCents: estimateCents,
      positionCents: availableSavingsCents,
    });
    const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

    await asOwner.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents,
      purchaseLocalDate,
    });

    const snapshot = await readSnapshot(t, seeded.householdId);
    const expense = snapshot.expenses.find((candidate) => candidate.goalId === seeded.cameraId);
    const rollup = snapshot.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);
    const camera = snapshot.wants.find((item) => item._id === seeded.cameraId);
    const trip = snapshot.wants.find((item) => item._id === seeded.tripId);

    expect(snapshot.expenses).toHaveLength(1);
    expect(expense).toMatchObject({
      householdId: seeded.householdId,
      name: "Camera",
      amountCents: actualAmountCents,
      goalId: seeded.cameraId,
      fromSavingsCents,
    });
    expect(snapshot.savings.positionCents).toBe(availableSavingsCents - fromSavingsCents);
    expect(camera).toMatchObject({
      status: "purchased",
      purchasedBy: seeded.ownerId,
      purchasedAt: serverNow,
      expenseId: expense?._id,
      updatedBy: seeded.ownerId,
    });
    expect(camera?.order).toBeUndefined();
    expect(trip).toMatchObject({
      status: "saving",
      order: 0,
    });
    expect(rollup).toMatchObject({
      totalSpentCents: actualAmountCents,
      spentFromSavingsCents: fromSavingsCents,
    });
    expect(rollup!.totalSpentCents - rollup!.spentFromSavingsCents).toBe(budgetImpactCents);
  },
);

test.each([
  {
    name: "takes progress from the end of the queue when the first item overruns",
    positionCents: 20_000n,
    addThirdWant: true,
    buyTrip: false,
    actualAmountCents: 12_000n,
    remainingAllocations: [8_000n, 0n],
  },
  {
    name: "takes progress from an earlier item when buying the last item",
    positionCents: 8_000n,
    addThirdWant: false,
    buyTrip: true,
    actualAmountCents: 6_000n,
    remainingAllocations: [2_000n],
  },
  {
    name: "uses unallocated surplus without reducing progress",
    positionCents: 22_000n,
    addThirdWant: false,
    buyTrip: false,
    actualAmountCents: 12_000n,
    remainingAllocations: [8_000n],
  },
  {
    name: "preserves progress when the purchase costs less than estimated",
    positionCents: 15_000n,
    addThirdWant: false,
    buyTrip: false,
    actualAmountCents: 8_000n,
    remainingAllocations: [7_000n],
  },
  {
    name: "leaves the remaining allocation at zero when no savings is available",
    positionCents: 0n,
    addThirdWant: false,
    buyTrip: false,
    actualAmountCents: 12_000n,
    remainingAllocations: [0n],
  },
  {
    name: "preserves progress when savings exactly covers both estimates",
    positionCents: 18_000n,
    addThirdWant: false,
    buyTrip: false,
    actualAmountCents: 10_000n,
    remainingAllocations: [8_000n],
  },
  {
    name: "reports the loss when only one other item remains",
    positionCents: 15_000n,
    addThirdWant: false,
    buyTrip: false,
    actualAmountCents: 12_000n,
    remainingAllocations: [3_000n],
  },
])(
  "purchase preview $name",
  async ({ positionCents, addThirdWant, buyTrip, actualAmountCents, remainingAllocations }) => {
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);

    const t = convexTest(schema, modules);
    const seeded = await seedPurchaseHouseholds(t, {
      allowanceCents: positionCents === 0n ? 5_000n : positionCents,
      // One closed day with no spending earns exactly `positionCents`.
      firstEligibleLocalDate: positionCents === 0n ? purchaseLocalDate : "2026-03-09",
    });

    if (addThirdWant) {
      await t.run(async (ctx) => {
        await ctx.db.insert("goals", {
          householdId: seeded.householdId,
          name: "Bike",
          estimatedCostCents: 5_000n,
          priority: "medium",
          notes: "",
          status: "saving",
          order: 2,
          createdBy: seeded.ownerId,
          updatedBy: seeded.ownerId,
          createdAt: 4,
          updatedAt: 4,
        });
      });
    }

    const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
    const goalId = buyTrip ? seeded.tripId : seeded.cameraId;
    const before = await asOwner.query(api.savings.getSummary, { now: serverNow });
    const preview = await asOwner.query(api.goals.previewPurchase, {
      goalId,
      actualAmountCents,
      now: serverNow,
    });

    const purchase = await asOwner.mutation(api.goals.purchase, {
      goalId,
      actualAmountCents,
      purchaseLocalDate,
    });
    const after = await asOwner.query(api.savings.getSummary, { now: serverNow });
    const snapshot = await readSnapshot(t, seeded.householdId);
    const expense = snapshot.expenses.find((candidate) => candidate.goalId === goalId);

    expect(purchase.status).toBe("ok");
    expect(before.availableSavingsCents).toBe(positionCents);
    expect(after.activeAllocations.map(({ allocatedCents }) => allocatedCents)).toEqual(
      remainingAllocations,
    );
    expect(preview.fromSavingsCents).toBe(expense?.fromSavingsCents);
    expect(preview.budgetImpactCents).toBe(actualAmountCents - preview.fromSavingsCents);

    const impacts = after.activeAllocations.flatMap((allocation) => {
      const previous = before.activeAllocations.find((item) => item.goalId === allocation.goalId);
      const want = snapshot.wants.find((item) => item._id === allocation.goalId);
      if (!previous || !want) {
        throw new Error("Expected the remaining Want and its original allocation");
      }

      const lostCents = previous.allocatedCents - allocation.allocatedCents;
      return lostCents > 0n
        ? [
            {
              goalId: allocation.goalId,
              name: want.name,
              lostCents,
              allocatedCentsAfter: allocation.allocatedCents,
            },
          ]
        : [];
    });
    expect(preview).toHaveProperty("progressLosses", impacts);
  },
);

test("recalculates funding from current server state instead of trusting a stale preview", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 15_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const preview = await asOwner.query(api.goals.previewPurchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 12_000n,
    now: serverNow,
  });

  expect(preview).toMatchObject({
    fromSavingsCents: 12_000n,
    budgetImpactCents: 0n,
  });

  await asOwner.mutation(api.expenses.createExpense, {
    name: "Unexpected repair",
    notes: "",
    amountCents: 10_000n,
    localDate: "2026-03-10",
  });

  await asOwner.mutation(api.goals.purchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const snapshot = await readSnapshot(t, seeded.householdId);
  const purchaseExpense = snapshot.expenses.find((expense) => expense.goalId === seeded.cameraId);

  expect(purchaseExpense).toMatchObject({
    amountCents: 12_000n,
    fromSavingsCents: 10_000n,
  });
  expect((purchaseExpense?.amountCents ?? 0n) - (purchaseExpense?.fromSavingsCents ?? 0n)).toBe(
    2_000n,
  );
  expect(snapshot.savings.positionCents).toBe(5_000n);
});

test("serializes competing purchases so the same savings cannot be spent twice", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await Promise.all([
    asOwner.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
    asOwner.mutation(api.goals.purchase, {
      goalId: seeded.tripId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
  ]);

  const snapshot = await readSnapshot(t, seeded.householdId);
  const purchaseExpenses = snapshot.expenses.filter((expense) => expense.goalId !== undefined);

  expect(purchaseExpenses).toHaveLength(2);
  expect(
    purchaseExpenses.reduce((sum, expense) => sum + (expense.fromSavingsCents ?? 0n), 0n),
  ).toBe(10_000n);
  expect(snapshot.savings.positionCents).toBe(0n);
  expect(
    snapshot.wants
      .filter((item) => item._id === seeded.cameraId || item._id === seeded.tripId)
      .map((item) => item.status),
  ).toEqual(["purchased", "purchased"]);
});

test("blocks cross-household, future-date, and client-timed purchases", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const asOther = t.withIdentity({ tokenIdentifier: "test|other" });

  await expect(
    asOther.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
    }),
  ).rejects.toThrow("Want item not found");

  await expect(
    asOwner.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate: "2026-03-11",
    }),
  ).rejects.toThrow();

  await expect(
    asOwner.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents: 10_000n,
      purchaseLocalDate,
      // @ts-expect-error Purchase mutations must never accept client time.
      now: serverNow + 86_400_000,
    }),
  ).rejects.toThrow();

  const snapshot = await readSnapshot(t, seeded.householdId);

  expect(snapshot.expenses).toEqual([]);
  expect(snapshot.savings.positionCents).toBe(10_000n);
  expect(snapshot.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "saving",
  });
});

test("corrects the linked purchase in place and recalculates exact funding", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.goals.purchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const purchased = await readSnapshot(t, seeded.householdId);
  const originalExpense = purchased.expenses.find((expense) => expense.goalId === seeded.cameraId);

  if (!originalExpense) {
    throw new Error("Expected the linked purchase expense");
  }

  await asOwner.mutation(api.goals.correctPurchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 8_000n,
  });

  const corrected = await readSnapshot(t, seeded.householdId);
  const correctedExpense = corrected.expenses.find((expense) => expense.goalId === seeded.cameraId);
  const rollup = corrected.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);

  expect(corrected.expenses).toHaveLength(1);
  expect(correctedExpense).toMatchObject({
    _id: originalExpense._id,
    amountCents: 8_000n,
    fromSavingsCents: 8_000n,
    goalId: seeded.cameraId,
  });
  expect(rollup).toMatchObject({
    totalSpentCents: 8_000n,
    spentFromSavingsCents: 8_000n,
  });
  expect(corrected.savings.positionCents).toBe(2_000n);
  expect(corrected.wants.find((item) => item._id === seeded.cameraId)).toMatchObject({
    status: "purchased",
    expenseId: originalExpense._id,
  });
});

test("undoes a purchase, reverses its rollup, and restores the item at the queue bottom", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, {
    positionCents: 10_000n,
  });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.goals.purchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  const purchased = await readSnapshot(t, seeded.householdId);
  const originalExpense = purchased.expenses.find((expense) => expense.goalId === seeded.cameraId);

  if (!originalExpense) {
    throw new Error("Expected the linked purchase expense");
  }

  await asOwner.mutation(api.goals.undoPurchase, { goalId: seeded.cameraId });

  const undone = await readSnapshot(t, seeded.householdId);
  const camera = undone.wants.find((item) => item._id === seeded.cameraId);
  const trip = undone.wants.find((item) => item._id === seeded.tripId);
  const rollup = undone.rollups.find((candidate) => candidate.localDate === purchaseLocalDate);

  expect(undone.expenses).toEqual([]);
  expect(rollup).toMatchObject({
    totalSpentCents: 0n,
    spentFromSavingsCents: 0n,
  });
  expect(undone.savings.positionCents).toBe(10_000n);
  expect(trip).toMatchObject({
    status: "saving",
    order: 0,
  });
  expect(camera).toMatchObject({
    status: "saving",
    order: 1,
    updatedBy: seeded.ownerId,
  });
  expect(camera?.purchasedBy).toBeUndefined();
  expect(camera?.purchasedAt).toBeUndefined();
  expect(camera?.expenseId).toBeUndefined();
});

const march12AtNoonNewYork = Date.UTC(2026, 2, 12, 16);

async function purchaseCameraOnMarch10(t: TestConvex<typeof schema>) {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const seeded = await seedPurchaseHouseholds(t, { positionCents: 10_000n });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  // $120 against a $100 savings: $100 from savings, $20 budget impact on March 10.
  await asOwner.mutation(api.goals.purchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 12_000n,
    purchaseLocalDate,
  });

  return { seeded, asOwner };
}

test("correcting a past purchase recomputes funding without it and corrects the closed day", async () => {
  const t = convexTest(schema, modules);
  const { seeded, asOwner } = await purchaseCameraOnMarch10(t);

  vi.setSystemTime(march12AtNoonNewYork);

  const result = await asOwner.mutation(api.goals.correctPurchase, {
    goalId: seeded.cameraId,
    actualAmountCents: 8_000n,
  });

  // Without the purchase the savings would be $100 + $50 + $50 = $200, so the
  // corrected $80 is fully savings-funded.
  expect(result).toMatchObject({
    status: "ok",
    fromSavingsCents: 8_000n,
    budgetImpactCents: 0n,
  });

  const corrected = await readSnapshot(t, seeded.householdId);

  expect(corrected.rollups.find((rollup) => rollup.localDate === purchaseLocalDate)).toMatchObject({
    totalSpentCents: 8_000n,
    spentFromSavingsCents: 8_000n,
  });
  expect(corrected.savings.positionCents).toBe(12_000n);
});

test("undoing a closed-day purchase after a time-zone change reverses its original day", async () => {
  const t = convexTest(schema, modules);
  const { seeded, asOwner } = await purchaseCameraOnMarch10(t);

  // The purchase is stamped at midnight New York (05:00 UTC), which is still
  // March 9 in Honolulu. It must stay on March 10.
  await t.run(async (ctx) => {
    await ctx.db.patch("households", seeded.householdId, { timeZone: "Pacific/Honolulu" });
  });
  vi.setSystemTime(march12AtNoonNewYork);

  await expect(
    asOwner.mutation(api.goals.undoPurchase, { goalId: seeded.cameraId }),
  ).resolves.toEqual({ status: "ok" });

  const undone = await readSnapshot(t, seeded.householdId);

  expect(undone.expenses).toEqual([]);
  expect(undone.rollups.find((rollup) => rollup.localDate === "2026-03-09")).toBeUndefined();
  expect(undone.rollups.find((rollup) => rollup.localDate === purchaseLocalDate)).toMatchObject({
    totalSpentCents: 0n,
    spentFromSavingsCents: 0n,
  });
  // $100 start + $50 (Mar 10, corrected) + $50 (Mar 11), as if never bought.
  expect(undone.savings.positionCents).toBe(20_000n);
});

test("pays a purchase dated before savings started entirely from the daily budget", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(serverNow);

  const t = convexTest(schema, modules);
  const seeded = await seedPurchaseHouseholds(t, { positionCents: 10_000n });
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  // Savings started March 8; a March 5 purchase must not borrow from them,
  // because a day before the start is never part of the savings position.
  await expect(
    asOwner.mutation(api.goals.purchase, {
      goalId: seeded.cameraId,
      actualAmountCents: 4_000n,
      purchaseLocalDate: "2026-03-05",
    }),
  ).resolves.toMatchObject({ status: "ok", fromSavingsCents: 0n, budgetImpactCents: 4_000n });

  const snapshot = await readSnapshot(t, seeded.householdId);

  expect(snapshot.expenses).toEqual([expect.objectContaining({ fromSavingsCents: 0n })]);
  expect(snapshot.savings.positionCents).toBe(10_000n);
});
