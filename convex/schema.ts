import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  spending: defineTable({
    name: v.string(),
    notes: v.string(),
    value: v.number(),
    month: v.string(),
    date: v.number(),
  }),
  extraDollars: defineTable({
    name: v.string(),
    notes: v.string(),
    value: v.number(),
  }),
  snowball: defineTable({
    name: v.string(),
    snowball: v.boolean(),
    amount: v.number(),
  }),
});
