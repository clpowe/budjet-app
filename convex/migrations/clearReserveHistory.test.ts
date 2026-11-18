/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { insertHousehold } from "../test_utils/seed";
import { DOCS_PER_BATCH } from "./clearReserveHistory";

const modules = {
  ...import.meta.glob("../**/*.ts"),
  "../migrations/clearReserveHistory.ts": () => import("./clearReserveHistory"),
};

test("deletes every reserve day across batches and leaves other tables alone", async () => {
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });

    for (let index = 0; index < DOCS_PER_BATCH + 5; index += 1) {
      await ctx.db.insert("goalReserveDays", {
        householdId,
        localDate: `day-${index}`,
        timeZone: "America/New_York",
        allowanceSnapshotCents: 5_500n,
        spendingSnapshotCents: 0n,
        contributionCents: 5_500n,
        closedAt: 0,
        updatedAt: 0,
      });
    }

    await ctx.db.insert("goalReserveLedgerEntries", {
      householdId,
      kind: "activation",
      amountCents: 0n,
      localDate: "2026-03-01",
      createdAt: 0,
    });
  });

  const first = await t.mutation(internal.migrations.clearReserveHistory.run, {
    table: "goalReserveDays",
  });

  expect(first).toEqual({ deleted: DOCS_PER_BATCH, isDone: false });

  await t.finishAllScheduledFunctions(() => {});

  const remaining = await t.run(async (ctx) => ({
    days: await ctx.db.query("goalReserveDays").collect(),
    entries: await ctx.db.query("goalReserveLedgerEntries").collect(),
    households: await ctx.db.query("households").collect(),
  }));

  expect(remaining.days).toHaveLength(0);
  expect(remaining.entries).toHaveLength(1);
  expect(remaining.households).toHaveLength(1);
});

test("deletes every ledger entry", async () => {
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    const { householdId } = await insertHousehold(ctx, { owner: "owner" });

    for (let index = 0; index < 3; index += 1) {
      await ctx.db.insert("goalReserveLedgerEntries", {
        householdId,
        kind: "daily_close",
        amountCents: 100n,
        localDate: `2026-03-0${index + 1}`,
        createdAt: 0,
      });
    }
  });

  await expect(
    t.mutation(internal.migrations.clearReserveHistory.run, {
      table: "goalReserveLedgerEntries",
    }),
  ).resolves.toEqual({ deleted: 3, isDone: true });

  expect(await t.run((ctx) => ctx.db.query("goalReserveLedgerEntries").collect())).toHaveLength(0);
});
