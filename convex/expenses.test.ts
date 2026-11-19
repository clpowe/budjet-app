/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { getSavingsSnapshot } from "./lib/savings_account";
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

async function readPosition(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedHouseholds>>["householdId"],
) {
  return await t.run(async (ctx) => {
    const household = await ctx.db.get(householdId);

    if (!household) {
      throw new Error("Expected household");
    }

    return (await getSavingsSnapshot(ctx, household, Date.now())).positionCents;
  });
}

async function getRollup(
  t: TestConvex<typeof schema>,
  householdId: Awaited<ReturnType<typeof seedHouseholds>>["householdId"],
  localDate: string,
) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("dailyBudgetTotals")
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
    localDate: "2026-03-10",
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  expect(expense).toMatchObject({
    householdId: seeded.householdId,
    name: "Coffee",
    notes: "Morning",
    amountCents: 425n,
    localDate: "2026-03-10",
  });

  const rollup = await getRollup(t, seeded.householdId, "2026-03-10");

  expect(rollup).toMatchObject({
    totalSpentCents: 425n,
    spentFromSavingsCents: 0n,
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
      localDate: "2026-03-10",
    }),
  ).resolves.toEqual({ success: true });

  await expect(
    asOwner.mutation(api.expenses.createExpense, {
      name: "Tomorrow",
      notes: "",
      amountCents: 2_000n,
      localDate: "2026-03-11",
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
    localDate: "2026-03-10",
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  await expect(
    asOwner.mutation(api.expenses.updateExpense, {
      expenseId: expense._id,
      name: "Coffee tomorrow",
      notes: "",
      amountCents: 600n,
      localDate: "2026-03-11",
    }),
  ).rejects.toThrow("Expense date cannot be in the future");

  expect(await t.run(async (ctx) => await ctx.db.get(expense._id))).toMatchObject({
    name: "Coffee",
    amountCents: 500n,
    localDate: "2026-03-10",
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
      localDate: "2026-03-10",
    }),
  ).rejects.toThrow("Not authenticated");

  const expenseId = await t.run(async (ctx) => {
    return await ctx.db.insert("expenses", {
      name: "Protected",
      notes: "",
      amountCents: 1_000n,
      householdId: seeded.householdId,
      localDate: "2026-03-10",
    });
  });

  await expect(
    asOther.mutation(api.expenses.updateExpense, {
      expenseId,
      name: "Hijacked",
      notes: "",
      amountCents: 1n,
      localDate: "2026-03-10",
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
    localDate: "2026-03-10",
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId: expense._id,
    name: "Groceries",
    notes: "Updated",
    amountCents: 1_500n,
    localDate: "2026-03-11",
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    totalSpentCents: 0n,
    spentFromSavingsCents: 0n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toMatchObject({
    totalSpentCents: 1_500n,
    spentFromSavingsCents: 0n,
  });

  await asOwner.mutation(api.expenses.deleteExpense, { expenseId: expense._id });

  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toMatchObject({
    totalSpentCents: 0n,
    spentFromSavingsCents: 0n,
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
      amountCents: 10_000n,
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      wantItemId,
      savingsUsedCents: 5_000n,
    });

    return { expenseId };
  });

  await expect(
    asOwner.mutation(api.expenses.updateExpense, {
      expenseId,
      name: "Camera",
      notes: "",
      amountCents: 9_000n,
      localDate: "2026-03-10",
    }),
  ).rejects.toThrow("Want purchases must be managed from the wants flow");

  await expect(asOwner.mutation(api.expenses.deleteExpense, { expenseId })).rejects.toThrow(
    "Want purchases must be managed from the wants flow",
  );
});

test("editing an expense on a closed day moves the savings position", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march11);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const expenseId = await t.run(async (ctx) => {
    // Every day from March 1 through March 10 is closed on March 11.
    await ctx.db.patch(seeded.householdId, { savingsStartLocalDate: "2026-03-01" });
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      totalSpentCents: 1_000n,
      spentFromSavingsCents: 0n,
      updatedAt: march11,
    });

    return await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Closed day purchase",
      notes: "",
      amountCents: 1_000n,
      localDate: "2026-03-10",
    });
  });

  const positionBefore = await readPosition(t, seeded.householdId);

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId,
    name: "Closed day purchase",
    notes: "Corrected",
    amountCents: 1_300n,
    localDate: "2026-03-10",
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    totalSpentCents: 1_300n,
    spentFromSavingsCents: 0n,
  });
  // March 10 is closed: its budget impact rose 300, so savings drop 300.
  expect(await readPosition(t, seeded.householdId)).toBe(positionBefore - 300n);
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
    localDate: "2026-03-10",
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("households", seeded.householdId, { timeZone: "UTC" });
  });

  const expense = await t.run(async (ctx) => {
    return await ctx.db
      .query("expenses")
      .withIndex("by_household_and_local_date", (q) => q.eq("householdId", seeded.householdId))
      .unique();
  });

  if (!expense) throw new Error("Expected the created expense");

  expect(expense.localDate).toBe("2026-03-10");

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId: expense._id,
    name: "Late dinner",
    notes: "with tip",
    amountCents: 2_500n,
  });

  expect(await asOwner.query(api.expenses.listDailyExpenses, { asOfTimestamp: march10 })).toEqual([
    expect.objectContaining({ localDate: "2026-03-10", notes: "with tip" }),
  ]);
  expect(await asOwner.query(api.expenses.listDailyExpenses, { asOfTimestamp: march11 })).toEqual(
    [],
  );
  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    totalSpentCents: 2_500n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toBeNull();

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId: expense._id,
    name: "Late dinner",
    notes: "with tip",
    amountCents: 2_500n,
    localDate: "2026-03-11",
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    totalSpentCents: 0n,
  });
  expect(await getRollup(t, seeded.householdId, "2026-03-11")).toMatchObject({
    totalSpentCents: 2_500n,
  });
});

test("lists monthly expenses by stored local date alongside income", async () => {
  const t = convexTest(schema, modules);
  const { householdId, otherHouseholdId } = await seedHouseholds(t);
  const date = Date.UTC(2026, 3, 1, 0);
  await t.run(async (ctx) => {
    await ctx.db.patch("households", householdId, { timeZone: "UTC" });
    const fields = { householdId, amountCents: 800n, notes: "" };
    await ctx.db.insert("expenses", { ...fields, name: "Stored March", localDate: "2026-03-31" });
    await ctx.db.insert("expenses", { ...fields, name: "April", localDate: "2026-04-01" });
    await ctx.db.insert("expenses", {
      ...fields,
      householdId: otherHouseholdId,
      name: "Another household",
      localDate: "2026-03-31",
    });
    await ctx.db.insert("income", {
      householdId,
      localDate: "2026-04-01",
      amountCents: 800n,
      notes: "",
      source: "April gift",
    });
  });

  const owner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const march = await owner.query(api.expenses.listMonthlyTransactions, {
    asOfTimestamp: date - 1,
  });
  const april = await owner.query(api.expenses.listMonthlyTransactions, { asOfTimestamp: date });
  expect(march.map(({ name, localDate }) => [name, localDate])).toEqual([
    ["Stored March", "2026-03-31"],
  ]);
  expect(april.map(({ name, localDate }) => [name, localDate])).toEqual([
    ["April", "2026-04-01"],
    ["April gift", "2026-04-01"],
  ]);
});

test("edits before the first eligible savings day leave the position alone", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march11);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const expenseId = await t.run(async (ctx) => {
    await ctx.db.patch(seeded.householdId, { savingsStartLocalDate: "2026-03-05" });
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-03",
      totalSpentCents: 1_000n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });

    return await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Before activation",
      notes: "",
      amountCents: 1_000n,
      localDate: "2026-03-03",
    });
  });

  const positionBefore = await readPosition(t, seeded.householdId);

  await asOwner.mutation(api.expenses.updateExpense, {
    expenseId,
    name: "Before activation",
    notes: "",
    amountCents: 1_300n,
    localDate: "2026-03-03",
  });

  expect(await getRollup(t, seeded.householdId, "2026-03-03")).toMatchObject({
    totalSpentCents: 1_300n,
  });
  expect(await readPosition(t, seeded.householdId)).toBe(positionBefore);
});

test("rejects an expense change that would push a daily rollup below zero", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(march11);

  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const expenseId = await t.run(async (ctx) => {
    // Inconsistent on purpose: the rollup holds less than the expense on that day.
    await ctx.db.insert("dailyBudgetTotals", {
      householdId: seeded.householdId,
      localDate: "2026-03-10",
      totalSpentCents: 500n,
      spentFromSavingsCents: 0n,
      updatedAt: 0,
    });

    return await ctx.db.insert("expenses", {
      householdId: seeded.householdId,
      name: "Too big",
      notes: "",
      amountCents: 1_000n,
      localDate: "2026-03-10",
    });
  });

  await expect(asOwner.mutation(api.expenses.deleteExpense, { expenseId })).rejects.toThrow(
    "Daily budget totals cannot go below zero",
  );

  expect(await getRollup(t, seeded.householdId, "2026-03-10")).toMatchObject({
    totalSpentCents: 500n,
  });
});
