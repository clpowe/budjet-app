import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import clerk from '@clerk/nuxt'

// Generate a random invite code
function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Create a new household
export const createHousehold = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    // Check if user already has a household
    if (user.householdId) {
      throw new Error("User already belongs to a household");
    }

    // Create household
    const householdId = await ctx.db.insert("households", {
      name: args.name,
      inviteCode: generateInviteCode(),
      ownerId: user._id,
      createdAt: Date.now(),
    });

    // Update user with household
    await ctx.db.patch(user._id, {
      householdId,
      role: "owner",
    });

    return householdId;
  },
});

// Join household with invite code
export const joinHousehold = mutation({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    // Check if user already has a household
    if (user.householdId) {
      throw new Error("User already belongs to a household");
    }

    // Find household by invite code
    const household = await ctx.db
      .query("households")
      .withIndex("by_invite_code", (q) =>
        q.eq("inviteCode", args.inviteCode.toUpperCase())
      )
      .first();

    if (!household) {
      throw new Error("Invalid invite code");
    }

    // Update user with household
    await ctx.db.patch(user._id, {
      householdId: household._id,
      role: "member",
    });

    return household._id;
  },
});

// Get current household
export const getMyHousehold = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || !user.householdId) return null;

    const household = await ctx.db.get(user.householdId);
    return household;
  },
});

// Get household members
export const getHouseholdMembers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || !user.householdId) return [];

    const members = await ctx.db
      .query("users")
      .withIndex("by_household", (q) => q.eq("householdId", user.householdId))
      .collect();

    return members;
  },
});

// Leave household
export const leaveHousehold = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || !user.householdId) {
      throw new Error("User is not in a household");
    }

    if (user.role === "owner") {
      throw new Error("Owner cannot leave household. Transfer ownership first.");
    }

    await ctx.db.patch(user._id, {
      householdId: undefined,
      role: "member",
    });
  },
});
