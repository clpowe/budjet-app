/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { getEffectiveTimeZone, getNextLocalMidnightTimestamp } from "./households";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
});

async function seedHousehold(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: "test|owner",
      email: "owner@example.com",
      role: "owner",
      createdAt: 0,
    });

    const memberId = await ctx.db.insert("users", {
      identityKey: "test|member",
      email: "member@example.com",
      role: "member",
      createdAt: 0,
    });

    const householdId = await ctx.db.insert("households", {
      name: "Timezone household",
      inviteCode: "TZTEST",
      ownerId,
      allowance: 55,
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      moneyMigrationCompletedAt: 0,
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });
    await ctx.db.patch(memberId, { householdId });

    return { householdId, ownerId, memberId };
  });
}

test("resolves legacy households to the default timezone", () => {
  expect(getEffectiveTimeZone({}, Date.UTC(2026, 0, 1))).toBe("America/New_York");

  expect(
    getEffectiveTimeZone(
      {
        timeZone: "America/New_York",
        pendingTimeZone: "Europe/London",
        pendingTimeZoneEffectiveAt: Date.UTC(2026, 2, 9, 4),
      },
      Date.UTC(2026, 2, 9, 3, 59),
    ),
  ).toBe("America/New_York");

  expect(
    getEffectiveTimeZone(
      {
        timeZone: "America/New_York",
        pendingTimeZone: "Europe/London",
        pendingTimeZoneEffectiveAt: Date.UTC(2026, 2, 9, 4),
      },
      Date.UTC(2026, 2, 9, 4),
    ),
  ).toBe("Europe/London");
});

test("schedules an owner timezone change for the next current-zone midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 2, 8, 15)));

  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const result = await asOwner.mutation(api.households.updateTimeZone, {
    timeZone: "Europe/London",
  });

  const expectedEffectiveAt = getNextLocalMidnightTimestamp(
    Date.UTC(2026, 2, 8, 15),
    "America/New_York",
  );

  expect(result).toEqual({
    currentTimeZone: "America/New_York",
    pendingTimeZone: "Europe/London",
    pendingTimeZoneEffectiveAt: expectedEffectiveAt,
  });

  const household = await t.run(async (ctx) => await ctx.db.get(seeded.householdId));

  expect(household).toMatchObject({
    timeZone: "America/New_York",
    pendingTimeZone: "Europe/London",
    pendingTimeZoneEffectiveAt: expectedEffectiveAt,
  });
});

test("rejects invalid zones and non-owner changes", async () => {
  const t = convexTest(schema, modules);
  await seedHousehold(t);

  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const asMember = t.withIdentity({ tokenIdentifier: "test|member" });

  await expect(
    asOwner.mutation(api.households.updateTimeZone, {
      timeZone: "Not/A-Real-Timezone",
    }),
  ).rejects.toThrow("Invalid time zone");

  await expect(
    asMember.mutation(api.households.updateTimeZone, {
      timeZone: "Europe/London",
    }),
  ).rejects.toThrow("Only the household owner can change the budget timezone");
});

test("replaces a pending timezone without changing its established boundary", async () => {
  vi.useFakeTimers();

  const firstRequestAt = Date.UTC(2026, 2, 8, 15);
  vi.setSystemTime(new Date(firstRequestAt));

  const t = convexTest(schema, modules);
  const seeded = await seedHousehold(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const first = await asOwner.mutation(api.households.updateTimeZone, {
    timeZone: "Europe/London",
  });

  vi.setSystemTime(new Date(firstRequestAt + 60 * 60 * 1_000));

  const replacement = await asOwner.mutation(api.households.updateTimeZone, {
    timeZone: "Asia/Tokyo",
  });

  expect(replacement).toEqual({
    currentTimeZone: "America/New_York",
    pendingTimeZone: "Asia/Tokyo",
    pendingTimeZoneEffectiveAt: first.pendingTimeZoneEffectiveAt,
  });

  const household = await t.run(async (ctx) => await ctx.db.get(seeded.householdId));

  expect(household).toMatchObject({
    pendingTimeZone: "Asia/Tokyo",
    pendingTimeZoneEffectiveAt: first.pendingTimeZoneEffectiveAt,
  });
});
