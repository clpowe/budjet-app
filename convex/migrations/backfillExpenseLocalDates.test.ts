/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { insertHousehold } from "../test_utils/seed";
import { EXPENSES_PER_BATCH } from "./backfillExpenseLocalDates";

const modules = {
  ...import.meta.glob("../**/*.ts"),
  "../migrations/backfillExpenseLocalDates.ts": () => import("./backfillExpenseLocalDates"),
};

// 03:30 UTC on March 10 is still March 9 in New York and already March 10 in UTC.
const march10At0330Utc = Date.UTC(2026, 2, 10, 3, 30);

test("backfills missing expense local dates in the household zone and keeps stored ones", async () => {
  const t = convexTest(schema, modules);

  const { legacyId, storedId } = await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });
    const legacyId = await ctx.db.insert("expenses", {
      name: "Legacy",
      notes: "",
      amount: 1,
      amountCents: 100n,
      householdId,
      date: march10At0330Utc,
    });
    const storedId = await ctx.db.insert("expenses", {
      name: "Already keyed",
      notes: "",
      amount: 1,
      amountCents: 100n,
      householdId,
      date: march10At0330Utc,
      localDate: "2026-03-10",
    });

    return { legacyId, storedId };
  });

  const result = await t.mutation(internal.migrations.backfillExpenseLocalDates.run, {
    cursor: null,
  });

  expect(result).toEqual({ patched: 1, isDone: true });

  const [legacy, stored] = await t.run(async (ctx) => [
    await ctx.db.get("expenses", legacyId),
    await ctx.db.get("expenses", storedId),
  ]);

  expect(legacy?.localDate).toBe("2026-03-09");
  expect(stored?.localDate).toBe("2026-03-10");
});

test("prefers the zone a closed reserve day recorded when it differs", async () => {
  const t = convexTest(schema, modules);

  const expenseId = await t.run(async (ctx) => {
    // The household now uses UTC, so the candidate key is 2026-03-10. That reserve
    // day was closed in New York, where the expense fell on March 9.
    const { householdId } = await insertHousehold(ctx, {
      owner: "owner",
      household: { timeZone: "UTC" },
    });

    await ctx.db.insert("goalReserveDays", {
      householdId,
      localDate: "2026-03-10",
      timeZone: "America/New_York",
      allowanceSnapshotCents: 5_500n,
      spendingSnapshotCents: 0n,
      contributionCents: 5_500n,
      closedAt: 0,
      updatedAt: 0,
    });

    return await ctx.db.insert("expenses", {
      name: "Before the zone change",
      notes: "",
      amount: 1,
      amountCents: 100n,
      householdId,
      date: march10At0330Utc,
    });
  });

  await t.mutation(internal.migrations.backfillExpenseLocalDates.run, { cursor: null });

  const expense = await t.run((ctx) => ctx.db.get("expenses", expenseId));
  expect(expense?.localDate).toBe("2026-03-09");
});

test("continues across pages", async () => {
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });

    for (let index = 0; index < EXPENSES_PER_BATCH + 5; index += 1) {
      await ctx.db.insert("expenses", {
        name: `Expense ${index}`,
        notes: "",
        amount: 1,
        amountCents: 100n,
        householdId,
        date: march10At0330Utc,
      });
    }
  });

  await t.mutation(internal.migrations.backfillExpenseLocalDates.run, { cursor: null });
  await t.finishAllScheduledFunctions(() => {});

  const missing = await t.run(async (ctx) =>
    (await ctx.db.query("expenses").collect()).filter((expense) => expense.localDate === undefined),
  );

  expect(missing).toHaveLength(0);
});
