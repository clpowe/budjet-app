/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedHouseholds(t: TestConvex<typeof schema>) {
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
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      createdAt: 0,
    });

    const otherHouseholdId = await ctx.db.insert("households", {
      name: "Other household",
      inviteCode: "OTHER01",
      ownerId: otherOwnerId,
      allowanceCents: 5_500n,
      timeZone: "America/New_York",
      createdAt: 0,
    });

    await ctx.db.patch(ownerId, { householdId });
    await ctx.db.patch(memberId, { householdId });
    await ctx.db.patch(otherOwnerId, { householdId: otherHouseholdId });

    const cameraId = await ctx.db.insert("goals", {
      householdId,
      name: "Camera",
      estimatedCostCents: 10_000n,
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
      priority: "low",
      notes: "",
      status: "saving",
      order: 1,
      createdBy: ownerId,
      updatedBy: ownerId,
      createdAt: 2,
      updatedAt: 2,
    });

    const otherGoalId = await ctx.db.insert("goals", {
      householdId: otherHouseholdId,
      name: "Other household item",
      estimatedCostCents: 5_000n,
      priority: "medium",
      notes: "",
      status: "idea",
      createdBy: otherOwnerId,
      updatedBy: otherOwnerId,
      createdAt: 3,
      updatedAt: 3,
    });

    for (let index = 0; index < 26; index += 1) {
      await ctx.db.insert("goals", {
        householdId,
        name: `Not now ${index}`,
        estimatedCostCents: 1_000n,
        priority: "low",
        notes: "",
        status: "on_hold",
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: 10 + index,
        updatedAt: 10 + index,
      });
    }

    return {
      ownerId,
      memberId,
      householdId,
      cameraId,
      tripId,
      otherGoalId,
    };
  });
}

function firstPage() {
  return {
    numItems: 25,
    cursor: null,
  };
}

test("creates trimmed items in the authenticated household", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const item = await asOwner.mutation(api.goals.create, {
    name: "  Noise-cancelling headphones  ",
    estimatedCostCents: 19_999n,
    priority: "medium",
    targetDate: Date.UTC(2026, 11, 25),
    notes: "  For flights  ",
  });

  expect(item).toMatchObject({
    householdId: seeded.householdId,
    name: "Noise-cancelling headphones",
    estimatedCostCents: 19_999n,
    priority: "medium",
    targetDate: Date.UTC(2026, 11, 25),
    notes: "For flights",
    status: "idea",
    createdBy: seeded.ownerId,
    updatedBy: seeded.ownerId,
  });

  await expect(
    asOwner.mutation(api.goals.create, {
      name: "Invalid",
      estimatedCostCents: 0n,
      priority: "medium",
      notes: "",
    }),
  ).rejects.toThrow("Estimated cost must be greater than zero");
});

test("lists the bounded active queue and one paginated inactive section", async () => {
  const t = convexTest(schema, modules);
  await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const asOther = t.withIdentity({ tokenIdentifier: "test|other" });

  const active = await asOwner.query(api.goals.list);

  expect(active.active.map((item) => [item.name, item.order])).toEqual([
    ["Camera", 0],
    ["Trip", 1],
  ]);

  const notNow = await asOwner.query(api.goals.listSection, {
    status: "on_hold",
    paginationOpts: firstPage(),
  });

  expect(notNow.page).toHaveLength(25);
  expect(notNow.isDone).toBe(false);

  const otherActive = await asOther.query(api.goals.list);
  expect(otherActive.active).toEqual([]);

  const ownerConsidering = await asOwner.query(api.goals.listSection, {
    status: "idea",
    paginationOpts: firstPage(),
  });

  const otherConsidering = await asOther.query(api.goals.listSection, {
    status: "idea",
    paginationOpts: firstPage(),
  });

  const otherNotNow = await asOther.query(api.goals.listSection, {
    status: "on_hold",
    paginationOpts: firstPage(),
  });

  expect(ownerConsidering.page).toEqual([]);
  expect(otherConsidering.page.map((item) => item.name)).toEqual(["Other household item"]);
  expect(otherNotNow.page).toEqual([]);
});

test("allows household members to edit items but blocks other households", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asMember = t.withIdentity({ tokenIdentifier: "test|member" });
  const asOther = t.withIdentity({ tokenIdentifier: "test|other" });

  const updated = await asMember.mutation(api.goals.update, {
    goalId: seeded.cameraId,
    name: "  Camera body  ",
    estimatedCostCents: 12_000n,
    priority: "medium",
    targetDate: null,
    notes: "  Updated by a household member  ",
  });

  expect(updated).toMatchObject({
    name: "Camera body",
    estimatedCostCents: 12_000n,
    priority: "medium",
    notes: "Updated by a household member",
    updatedBy: seeded.memberId,
  });
  expect(updated.targetDate).toBeUndefined();

  await expect(
    asOther.mutation(api.goals.update, {
      goalId: seeded.cameraId,
      name: "Hijacked",
      estimatedCostCents: 1n,
      priority: "low",
      targetDate: null,
      notes: "",
    }),
  ).rejects.toThrow("Goal not found");
});

test("appends planned items and removes queue order when they leave the active queue", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  const created = await asOwner.mutation(api.goals.create, {
    name: "Speaker",
    estimatedCostCents: 20_000n,
    priority: "high",
    notes: "",
  });

  const planned = await asOwner.mutation(api.goals.changeStatus, {
    goalId: created._id,
    status: "saving",
  });

  expect(planned).toMatchObject({
    kind: "updated",
    item: {
      status: "saving",
      order: 2,
    },
  });

  const movedOut = await asOwner.mutation(api.goals.changeStatus, {
    goalId: seeded.cameraId,
    status: "idea",
  });

  expect(movedOut).toMatchObject({
    kind: "updated",
    item: {
      status: "idea",
    },
  });

  if (movedOut.kind !== "updated") {
    throw new Error("Expected the goal status update to complete");
  }

  expect(movedOut.item.order).toBeUndefined();
});

test("requires a complete current queue for reordering and keeps priority data separate", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await expect(
    asOwner.mutation(api.goals.reorder, {
      expectedGoalIds: [seeded.cameraId, seeded.tripId],
      goalIds: [seeded.cameraId, seeded.cameraId],
    }),
  ).rejects.toThrow();

  await expect(
    asOwner.mutation(api.goals.reorder, {
      expectedGoalIds: [seeded.cameraId, seeded.tripId],
      goalIds: [seeded.cameraId],
    }),
  ).rejects.toThrow();

  await expect(
    asOwner.mutation(api.goals.reorder, {
      expectedGoalIds: [seeded.cameraId, seeded.tripId],
      goalIds: [seeded.cameraId, seeded.otherGoalId],
    }),
  ).rejects.toThrow();

  await asOwner.mutation(api.goals.reorder, {
    expectedGoalIds: [seeded.cameraId, seeded.tripId],
    goalIds: [seeded.tripId, seeded.cameraId],
  });

  await asOwner.mutation(api.goals.update, {
    goalId: seeded.tripId,
    name: "Trip",
    estimatedCostCents: 8_000n,
    priority: "high",
    targetDate: Date.UTC(2027, 5, 1),
    notes: "Priority and date should not reorder this item",
  });

  const active = await asOwner.query(api.goals.list);

  expect(active.active.map((item) => [item._id, item.order])).toEqual([
    [seeded.tripId, 0],
    [seeded.cameraId, 1],
  ]);
});

test("rejects a stale reorder even when the active membership is unchanged", async () => {
  const t = convexTest(schema, modules);
  const { cameraId, tripId } = await seedHouseholds(t);
  const owner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const member = t.withIdentity({ tokenIdentifier: "test|member" });
  const expectedGoalIds = (await member.query(api.goals.list)).active.map((item) => item._id);

  expect(
    await owner.mutation(api.goals.reorder, {
      expectedGoalIds,
      goalIds: [tripId, cameraId],
    }),
  ).toEqual({ success: true });
  expect(
    await member.mutation(api.goals.reorder, {
      expectedGoalIds,
      goalIds: expectedGoalIds,
    }),
  ).toEqual({ success: false });
  expect((await member.query(api.goals.list)).active.map((item) => item._id)).toEqual([
    tripId,
    cameraId,
  ]);
});

test("refuses a one-hundred-and-first active item", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedHouseholds(t);
  const asOwner = t.withIdentity({ tokenIdentifier: "test|owner" });

  await t.run(async (ctx) => {
    for (let order = 2; order < 100; order += 1) {
      await ctx.db.insert("goals", {
        householdId: seeded.householdId,
        name: `Active ${order}`,
        estimatedCostCents: 1_000n,
        priority: "low",
        notes: "",
        status: "saving",
        order,
        createdBy: seeded.ownerId,
        updatedBy: seeded.ownerId,
        createdAt: order,
        updatedAt: order,
      });
    }
  });

  const created = await asOwner.mutation(api.goals.create, {
    name: "Overflow item",
    estimatedCostCents: 1_000n,
    priority: "low",
    notes: "",
  });

  await expect(
    asOwner.mutation(api.goals.changeStatus, {
      goalId: created._id,
      status: "saving",
    }),
  ).rejects.toThrow("Move an item to Considering or Not now before planning another purchase");
});
