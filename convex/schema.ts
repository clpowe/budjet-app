import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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

  households: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    ownerId: v.id("users"),
    allowanceCents: v.int64(),
    timeZone: v.string(),
    pendingTimeZone: v.optional(v.string()),
    pendingTimeZoneEffectiveAt: v.optional(v.number()),
    savingsStartLocalDate: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_invite_code", ["inviteCode"]),

  expenses: defineTable({
    name: v.string(),
    notes: v.string(),
    amount: v.number(),
    amountCents: v.optional(v.int64()),
    householdId: v.id("households"),
    date: v.number(),
    /** Household-local YYYY-MM-DD the expense counts against; fixed at write time. */
    localDate: v.optional(v.string()),
    wantItemId: v.optional(v.id("wantItems")),
    savingsUsedCents: v.optional(v.int64()),
    reserveUsedCents: v.optional(v.int64()),
  })
    .index("by_household", ["householdId", "date"])
    .index("by_household_and_local_date_and_date", ["householdId", "localDate", "date"]),

  windfall: defineTable({
    source: v.string(),
    notes: v.string(),
    householdId: v.id("households"),
    amount: v.number(),
    date: v.optional(v.number()),
  }).index("by_household_date", ["householdId", "date"]),

  debts: defineTable({
    creditor: v.string(),
    isPriority: v.boolean(),
    householdId: v.id("households"),
    payment: v.number(),
    order: v.optional(v.number()),
  })
    .index("by_household", ["householdId"])
    .index("by_household_order", ["householdId", "order"]),

  wantItems: defineTable({
    householdId: v.id("households"),
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    targetDate: v.optional(v.number()),
    notes: v.string(),
    status: v.union(
      v.literal("considering"),
      v.literal("plan_for_it"),
      v.literal("not_now"),
      v.literal("bought"),
    ),
    order: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    purchasedBy: v.optional(v.id("users")),
    purchasedAt: v.optional(v.number()),
    expenseId: v.optional(v.id("expenses")),
  })
    .index("by_household_and_status", ["householdId", "status"])
    .index("by_household_and_status_and_order", ["householdId", "status", "order"]),

  dailyBudgetRollups: defineTable({
    householdId: v.id("households"),
    localDate: v.string(),
    expenseCents: v.int64(),
    savingsFundedExpenseCents: v.optional(v.int64()),
    reserveFundedExpenseCents: v.int64(),
    budgetImpactExpenseCents: v.int64(),
    updatedAt: v.number(),
  }).index("by_household_and_local_date", ["householdId", "localDate"]),

  chatMessages: defineTable({
    householdId: v.id("households"),
    senderId: v.id("users"),
    body: v.string(),
  }).index("by_household", ["householdId"]),
});
