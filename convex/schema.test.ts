/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("accepts household timezone and cent-valued want data", async () => {
  const t = convexTest(schema, modules);

  const seeded = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      name: "Test Owner",
      role: "owner",
      createdAt: 0,
    });

    const householdId = await ctx.db.insert("households", {
      name: "Test household",
      inviteCode: "TEST01",
      ownerId,
      allowance: 55,
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      pendingTimeZone: "America/Chicago",
      pendingTimeZoneEffectiveAt: 1_800_000_000_000,
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });

    const wantItemId = await ctx.db.insert("wantItems", {
      householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "medium",
      notes: "",
      status: "considering",
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 0,
      updatedAt: 0,
    });

    const household = await ctx.db.get(householdId);
    const wantItem = await ctx.db.get(wantItemId);

    if (!household || !wantItem) {
      throw new Error("Expected seeded documents to exist");
    }

    return { household, wantItem };
  });

  expect(seeded.household).toMatchObject({
    allowanceCents: 5_500n,
    timeZone: "America/New_York",
    pendingTimeZone: "America/Chicago",
    pendingTimeZoneEffectiveAt: 1_800_000_000_000,
    moneyMigrationCompletedAt: 0,
  });

  expect(seeded.wantItem).toMatchObject({
    estimatedCostCents: 10_000n,
    status: "considering",
  });
});
