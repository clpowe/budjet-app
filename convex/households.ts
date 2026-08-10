import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findCurrentUser, getAuthenticatedUser } from "./lib/helpers";

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const createHousehold = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (user.householdId) {
      throw new Error("User already belongs to a household");
    }

    const householdId = await ctx.db.insert("households", {
      name: args.name,
      inviteCode: generateInviteCode(),
      ownerId: user._id,
      createdAt: Date.now(),
      allowance: 55,
    });

    await ctx.db.patch(user._id, {
      householdId,
      role: "owner",
    });

    return householdId;
  },
});

export const updateHouseholdMembers = mutation({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (user.householdId) {
      throw new Error("User already belongs to a household");
    }

    const household = await ctx.db
      .query("households")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", args.inviteCode.toUpperCase()))
      .first();

    if (!household) {
      throw new Error("Invalid invite code");
    }

    await ctx.db.patch(user._id, {
      householdId: household._id,
      role: "member",
    });

    return household._id;
  },
});

export const getMyHousehold = query({
  args: {},
  handler: async (ctx) => {
    const user = await findCurrentUser(ctx);

    if (!user?.householdId) {
      return null;
    }

    return await ctx.db.get(user.householdId);
  },
});

export const listHouseholdMembers = query({
  args: {},
  handler: async (ctx) => {
    const user = await findCurrentUser(ctx);

    if (!user?.householdId) {
      return [];
    }

    return await ctx.db
      .query("users")
      .withIndex("by_household", (q) => q.eq("householdId", user.householdId))
      .collect();
  },
});

export const updateHouseholdMembership = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    if (user.role === "owner") {
      throw new Error("Owner cannot leave household. Transfer ownership first.");
    }

    await ctx.db.patch(user._id, {
      householdId: undefined,
      role: "member",
    });

    return null;
  },
});
