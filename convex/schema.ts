import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    householdId: v.optional(v.id("households")),
    role: v.union(v.literal("owner"), v.literal("member")),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]).index("by_household", ["householdId"]),

  households: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    ownerId: v.id("users"),
    createdAt: v.number(),
  }).index("by_invite_code", ["inviteCode"]),

  spending: defineTable({
    name: v.string(),
    notes: v.string(),
    value: v.number(),
    month: v.string(),
    householdId: v.id("households"),
    date: v.number(),
  }).index("by_household", ["householdId"]),

  extraDollars: defineTable({
    name: v.string(),
    notes: v.string(),
    householdId: v.id("households"),
    value: v.number(),
  }).index("by_household", ["householdId"]),

  snowball: defineTable({
    name: v.string(),
    snowball: v.boolean(),
    householdId: v.id("households"),
    amount: v.number(),
  }).index("by_household", ["householdId"]),
});
