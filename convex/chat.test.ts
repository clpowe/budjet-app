/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Owner has a profile name; member has none, so their name falls back to the email local part.
async function seedHousehold(t: TestConvex<typeof schema>, label: string) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      identityKey: `test|${label}-owner`,
      email: `${label}-owner@example.com`,
      name: `${label} Owner`,
      role: "owner",
      createdAt: 0,
    });

    const memberId = await ctx.db.insert("users", {
      identityKey: `test|${label}-member`,
      email: `${label}-member@example.com`,
      role: "member",
      createdAt: 0,
    });

    const householdId = await ctx.db.insert("households", {
      name: `${label} household`,
      inviteCode: label.toUpperCase(),
      ownerId,
      createdAt: 0,
    });

    await ctx.db.patch("users", ownerId, { householdId });
    await ctx.db.patch("users", memberId, { householdId });

    return { householdId, ownerId, memberId };
  });
}

async function seedLoner(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      identityKey: "test|loner",
      email: "loner@example.com",
      role: "member",
      createdAt: 0,
    });
  });
}

function as(t: TestConvex<typeof schema>, identityKey: string) {
  return t.withIdentity({ tokenIdentifier: identityKey });
}

test("shares messages within a household with isOwn per viewer", async () => {
  const t = convexTest(schema, modules);
  const alpha = await seedHousehold(t, "alpha");

  await as(t, "test|alpha-owner").mutation(api.chat.send, { body: "Groceries done" });

  const ownerView = await as(t, "test|alpha-owner").query(api.chat.list, {});
  const memberView = await as(t, "test|alpha-member").query(api.chat.list, {});

  expect(ownerView).toMatchObject([
    { senderId: alpha.ownerId, senderName: "alpha Owner", body: "Groceries done", isOwn: true },
  ]);
  expect(memberView).toMatchObject([{ body: "Groceries done", isOwn: false }]);
  expect(ownerView[0]).not.toHaveProperty("householdId");
});

test("isolates households from each other", async () => {
  const t = convexTest(schema, modules);
  await seedHousehold(t, "alpha");
  await seedHousehold(t, "beta");

  await as(t, "test|alpha-owner").mutation(api.chat.send, { body: "Alpha only" });

  expect(await as(t, "test|beta-owner").query(api.chat.list, {})).toEqual([]);
});

test("list returns empty when unauthenticated or household-less", async () => {
  const t = convexTest(schema, modules);
  await seedHousehold(t, "alpha");
  await seedLoner(t);
  await as(t, "test|alpha-owner").mutation(api.chat.send, { body: "Hello" });

  expect(await t.query(api.chat.list, {})).toEqual([]);
  expect(await as(t, "test|loner").query(api.chat.list, {})).toEqual([]);
});

test("send rejects when unauthenticated, household-less, or household is missing", async () => {
  const t = convexTest(schema, modules);
  const alpha = await seedHousehold(t, "alpha");
  await seedLoner(t);

  await expect(t.mutation(api.chat.send, { body: "Hi" })).rejects.toThrow("Not authenticated");
  await expect(as(t, "test|loner").mutation(api.chat.send, { body: "Hi" })).rejects.toThrow(
    "User is not in a household",
  );

  await t.run(async (ctx) => {
    await ctx.db.delete("households", alpha.householdId);
  });

  await expect(as(t, "test|alpha-owner").mutation(api.chat.send, { body: "Hi" })).rejects.toThrow(
    "Household not found",
  );
});

test("joining shows prior history; leaving ends access while messages remain", async () => {
  const t = convexTest(schema, modules);
  await seedHousehold(t, "alpha");
  await seedLoner(t);

  await as(t, "test|alpha-member").mutation(api.chat.send, { body: "From member" });

  await as(t, "test|loner").mutation(api.households.joinHousehold, {
    inviteCode: "ALPHA",
  });
  expect(await as(t, "test|loner").query(api.chat.list, {})).toMatchObject([
    { body: "From member" },
  ]);

  await as(t, "test|alpha-member").mutation(api.households.leaveHousehold, {});
  expect(await as(t, "test|alpha-member").query(api.chat.list, {})).toEqual([]);
  expect(await as(t, "test|alpha-owner").query(api.chat.list, {})).toMatchObject([
    { body: "From member" },
  ]);
});

test("sender name falls back to email local part and follows profile renames", async () => {
  const t = convexTest(schema, modules);
  const alpha = await seedHousehold(t, "alpha");

  await as(t, "test|alpha-member").mutation(api.chat.send, { body: "Hi" });
  expect(await as(t, "test|alpha-owner").query(api.chat.list, {})).toMatchObject([
    { senderName: "alpha-member" },
  ]);

  await t.run(async (ctx) => {
    await ctx.db.patch("users", alpha.memberId, { name: "   " });
  });
  expect(await as(t, "test|alpha-owner").query(api.chat.list, {})).toMatchObject([
    { senderName: "alpha-member" },
  ]);

  await t.run(async (ctx) => {
    await ctx.db.patch("users", alpha.memberId, { name: "  Sam  " });
  });
  expect(await as(t, "test|alpha-owner").query(api.chat.list, {})).toMatchObject([
    { senderName: "Sam" },
  ]);
});

test("validates body length and stores it trimmed", async () => {
  const t = convexTest(schema, modules);
  await seedHousehold(t, "alpha");
  const owner = as(t, "test|alpha-owner");

  await expect(owner.mutation(api.chat.send, { body: "" })).rejects.toMatchObject({
    data: { code: "EMPTY_BODY" },
  });
  await expect(owner.mutation(api.chat.send, { body: "  \n\t " })).rejects.toMatchObject({
    data: { code: "EMPTY_BODY" },
  });
  await expect(owner.mutation(api.chat.send, { body: "x".repeat(2_001) })).rejects.toMatchObject({
    data: { code: "BODY_TOO_LONG" },
  });

  // Trimming happens before the length check, so padding does not count.
  await owner.mutation(api.chat.send, { body: `  ${"x".repeat(2_000)}  ` });
  await owner.mutation(api.chat.send, { body: "  hello\nthere \n" });

  const messages = await owner.query(api.chat.list, {});
  expect(messages.map((message) => message.body)).toEqual(["x".repeat(2_000), "hello\nthere"]);
});

test("returns the latest 50 messages oldest-first", async () => {
  const t = convexTest(schema, modules);
  const alpha = await seedHousehold(t, "alpha");

  for (let i = 0; i < 60; i++) {
    await t.run(async (ctx) => {
      await ctx.db.insert("chatMessages", {
        householdId: alpha.householdId,
        senderId: alpha.ownerId,
        body: `m${i}`,
      });
    });
  }

  const messages = await as(t, "test|alpha-owner").query(api.chat.list, {});

  expect(messages).toHaveLength(50);
  expect(messages[0]?.body).toBe("m10");
  expect(messages.at(-1)?.body).toBe("m59");
});
