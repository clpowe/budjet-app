/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { insertHousehold } from "./test_utils/seed";

const modules = import.meta.glob("./**/*.ts");

const march10 = Date.UTC(2026, 2, 10, 16);
const march10At1159pmNewYork = Date.UTC(2026, 2, 11, 3, 59);
const march11 = Date.UTC(2026, 2, 11, 16);

afterEach(() => {
  vi.useRealTimers();
});

async function seedHouseholds(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const primary = await insertHousehold(ctx, { owner: "owner", inviteCode: "PRIMARY" });
    const other = await insertHousehold(ctx, { owner: "other", inviteCode: "OTHER" });

    return {
      householdId: primary.householdId,
      otherHouseholdId: other.householdId,
      ownerId: primary.ownerId,
      otherOwnerId: other.ownerId,
    };
  });
}

async function getRollup(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedHouseholds>>["householdId"],
  localDate: string,
) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", localDate),
      )
      .unique();
  });
}

test("creates exact cents in the authenticated household without accepting a household ID", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.expenses.createExpense, {
    name: "Coffee",
    notes: "Morning",
    amountCents: 425n,
    date: march10,
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  expect(expense).toMatchObject({
    householdId: seeded.householdId,
    name: "Coffee",
    notes: "Morning",
    amountCents: 425n,
    amount: 4.25,
    date: march10,
  });

  const rollup = await getRollup(t, seeded.householdId, "2026-03-10");

  expect(rollup).toMatchObject({
    expenseCents: 425n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 425n,
  });
});

test("allows a later timestamp today but rejects creating an expense on a future local date", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march10);

  const t = convexTest(schema, modules);
  await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await expect(
    asOwner.mutation(api.expenses.createExpense, {
      name: "Late dinner",
      notes: "",
      amountCents: 2_000n,
      date: march10At1159pmNewYork,
    }),
  ).resolves.toEqual({ success: true });

  await expect(
    asOwner.mutation(api.expenses.createExpense, {
      name: "Tomorrow",
      notes: "",
      amountCents: 2_000n,
      date: march11,
    }),
  ).rejects.toThrow("Expense date cannot be in the future");
});

test("rejects moving an existing expense to a future local date", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march10);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.expenses.createExpense, {
    name: "Coffee",
    notes: "",
    amountCents: 500n,
    date: march10,
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  await expect(
    asOwner.mutation(api.expenses.updateExpense, {
      expenseId: expense._id,
      name: "Coffee tomorrow",
      notes: "",
      amountCents: 600n,
      date: march11,
    }),
  ).rejects.toThrow("Expense date cannot be in the future");

  expect(await t.run(async (ctx) => await ctx.db.get(expense._id))).toMatchObject({
    name: "Coffee",
    amountCents: 500n,
    date: march10,
  });
});

test("rejects unauthenticated and cross-household expense writes", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOther = t.withIdentity({ tokenIdentifier: "test|other" });

  await expect(
    t.mutation(api.expenses.createExpense, {
      name: "No session",
      notes: "",
      amountCents: 100n,
      date: march10,
    }),
  ).rejects.toThrow("Not authenticated");

  const expenseId = await t.run(async (ctx) => {
    return await ctx.db.insert("expenses", {
      name: "Protected",
      notes: "",
      amount: 10,
      amountCents: 1_000n,
      householdId: seeded.householdId,
      date: march10,
    });
  });

  await expect(
    asOther.mutation(api.expenses.updateExpense, {
      expenseId,
      name: "Hijacked",
      notes: "",
      amountCents: 1n,
      date: march10,
    }),
  ).rejects.toThrow("Expense not found");

  await expect(asOther.mutation(api.expenses.deleteExpense, { expenseId })).rejects.toThrow(
    "Expense not found",
  );

  const expense = await t.run(async (ctx) => await ctx.db.get(expenseId));
  expect(expense).not.toBeNull();
});

test("maintains exact rollups when an expense changes days or is deleted", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await asOwner.mutation(api.expenses.createExpense, {
    name: "Groceries",
    notes: "",
    amountCents: 1_200n,
    date: march10,
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId: expense._id,
    name: "Groceries",
    notes: "Updated",
    amountCents: 1_500n,
    date: march11,
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    expenseCents: 0n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 0n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toMatchObject({
    expenseCents: 1_500n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 1_500n,
  });

  await asOwner.mutation(api.expenses.deleteExpense, {
    expenseId: expense._id,
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toMatchObject({
    expenseCents: 0n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 0n,
  });
});

test("refuses generic edits and deletes for want purchases", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const { expenseId } = await t.run(async (ctx) => {
    const wantItemId = await ctx.db.insert("wantItems", {
      householdId: seeded.householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high",
      notes: "",
      status: "bought",
      createdBy: seeded.ownerId,
      updatedBy: seeded.ownerId,
      createdAt: 0,
      updatedAt: 0,
    });
    const expenseId = await ctx.db.insert("expenses", {
      name: "Camera",
      notes: "",
      amount: 100,
      amountCents: 10_000n,
      householdId: seeded.householdId,
      date: march10,
      wantItemId,
      reserveUsedCents: 5_000n,
    });

    return { expenseId };
  });

  await expect(
    asOwner.mutation(api.expenses.updateExpense, {
      expenseId,
      name: "Camera",
      notes: "",
      amountCents: 9_000n,
      date: march10,
    }),
  ).rejects.toThrow("Want purchases must be managed from the wants flow");

  await expect(asOwner.mutation(api.expenses.deleteExpense, { expenseId })).rejects.toThrow(
    "Want purchases must be managed from the wants flow",
  );
});

test("corrects closed-day reserve snapshots and position transactionally", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march11);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const expenseId = await t.run(async (ctx) => {
    await ctx.db.insert("goalReserveStates", {
      householdId: seeded.householdId,
      positionCents: 1_000n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-03-01",
      // Every day through March 10 is closed, so the edit needs no catch-up.
      lastClosedLocalDate: "2026-03-10",
      updatedAt: 0,
    });
    await ctx.db.insert("goalReserveLedgerEntries", {
      householdId: seeded.householdId,
      kind: "activation",
      amountCents: 0n,
      localDate: "2026-02-28",
      actorId: seeded.ownerId,
      createdAt: 0,
    });
    await ctx.db.insert("goalReserveLedgerEntries", {
      householdId: seeded.householdId,
      kind: "daily_close",
      amountCents: 1_000n,
      localDate: "2026-03-01",
      allowanceSnapshotCents: 5_500n,
      spendingSnapshotCents: 4_500n,
      createdAt: 0,
    });
    await ctx.db.insert("goalReserveDays", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_500n,
      spendingSnapshotCents: 1_000n,
      contributionCents: 4_500n,
      closedAt: march11,
      updatedAt: march11,
    });
    await ctx.db.insert("dailyBudgetRollups", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      expenseCents: 1_000n,
      reserveFundedExpenseCents: 0n,
      budgetImpactExpenseCents: 1_000n,
      updatedAt: march11,
    });

    return await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Closed day purchase",
      notes: "",
      amount: 10,
      amountCents: 1_000n,
      date: march10,
    });
  });

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId,
    name: "Closed day purchase",
    notes: "Corrected",
    amountCents: 1_300n,
    date: march10,
  });

  const result = await t.run(async (ctx) => {
    const day = await ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", seeded.householdId).eq("localDate", "2026-03-10"),
      )
      .unique();
    const state = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique();
    const entries = await ctx.db
      .query("goalReserveLedgerEntries")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", seeded.householdId))
      .collect();

    return { day, entries, state };
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    expenseCents: 1_300n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 1_300n,
  });
  expect(result.day).toMatchObject({
    spendingSnapshotCents: 1_300n,
    contributionCents: 4_200n,
  });
  expect(result.state?.positionCents).toBe(700n);
  expect(result.entries).toContainEqual(
    expect.objectContaining({
      kind: "correction",
      amountCents: -300n,
      localDate: "2026-03-10",
      sourceExpenseId: expenseId,
    }),
  );
  expect(result.entries.reduce((sum, entry) => sum + entry.amountCents, 0n)).toBe(
    result.state?.positionCents,
  );
});

test("editing an expense after a time-zone change keeps it on its original local day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march10At1159pmNewYork);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  // 23:59 on March 10 in New York is already March 11 in UTC.
  await asOwner.mutation(api.expenses.createExpense, {
    name: "Late dinner",
    notes: "",
    amountCents: 2_000n,
    date: march10At1159pmNewYork,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("households", seeded.householdId, { timeZone: "UTC" });
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  expect(expense.localDate).toBe("2026-03-10");

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId: expense._id,
    name: "Late dinner",
    notes: "with tip",
    amountCents: 2_500n,
    date: expense.date,
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    expenseCents: 2_500n,
    budgetImpactExpenseCents: 2_500n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toBeNull();

  await asOwner.mutation(api.expenses.deleteExpense, { expenseId: expense._id });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    expenseCents: 0n,
    budgetImpactExpenseCents: 0n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toBeNull();
});

test("expense writes wait while the reserve catches up on closed days", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march10);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await t.run(async (ctx) => {
    await ctx.db.insert("goalReserveStates", {
      householdId: seeded.householdId,
      positionCents: 0n,
      activatedAt: 0,
      firstEligibleLocalDate: "2026-01-01",
      updatedAt: 0,
    });
  });

  const result = await asOwner.mutation(api.expenses.createExpense, {
    name: "Coffee",
    notes: "",
    amountCents: 500n,
    date: march10,
  });

  expect(result).toEqual({ success: false, reason: "reserve_syncing" });

  const syncing = await t.run(async (ctx) => ({
    expenses: await ctx.db
      .query("expenses")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .collect(),
    state: await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", seeded.householdId))
      .unique(),
  }));

  expect(syncing.expenses).toEqual([]);
  expect(syncing.state?.lastClosedLocalDate).toBe("2026-01-31");

  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  await expect(
    asOwner.mutation(api.expenses.createExpense, {
      name: "Coffee",
      notes: "",
      amountCents: 500n,
      date: march10,
    }),
  ).resolves.toEqual({ success: true });
  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    budgetImpactExpenseCents: 500n,
  });
});
