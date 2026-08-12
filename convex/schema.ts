import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. Users
  users: defineTable({
    identityKey: v.optional(v.string()),
    email: v.string(),
    name: v.optional(v.string()),
    householdId: v.optional(v.id("households")),
    role: v.union(v.literal("owner"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_identity_key", ["identityKey"])
    .index("by_household", ["householdId"]),

  // 2. Households
  households: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    ownerId: v.id("users"),
    allowance: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_invite_code", ["inviteCode"]),

  // 3. Expenses (was 'spending')
  expenses: defineTable({
    name: v.string(),
    notes: v.string(),
    amount: v.number(), // Standardized to 'amount'
    householdId: v.id("households"),
    date: v.number(),
  }).index("by_household", ["householdId", "date"]),

  // 4. Incomes (was 'extraDollars')
  windfall: defineTable({
    source: v.string(), // Renamed 'name' -> 'source' for clarity
    notes: v.string(),
    householdId: v.id("households"),
    amount: v.number(),
    date: v.optional(v.number()),
  }).index("by_household_date", ["householdId", "date"]),

  // 5. Debts (was 'snowball')
  debts: defineTable({
    creditor: v.string(),
    isPriority: v.boolean(),
    householdId: v.id("households"),
    payment: v.number(),
    order: v.optional(v.number()),
  })
    .index("by_household", ["householdId"])
    .index("by_household_order", ["householdId", "order"]),
});
