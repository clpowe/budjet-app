import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findCurrentUser, getAuthenticatedUser } from "./lib/helpers";
import type { Doc } from "./_generated/dataModel";
import { getLocalDateKey, getLocalDayBounds, getNextLocalDate } from "./lib/want_reserve";

const DEFAULT_HOUSEHOLD_TIME_ZONE = "America/New_York";

type HouseholdTimeZoneSettings = Pick<
  Doc<"households">,
  "timeZone" | "pendingTimeZone" | "pendingTimeZoneEffectiveAt"
>;

const timeZoneUpdateResultValidator = v.object({
  currentTimeZone: v.string(),
  pendingTimeZone: v.string(),
  pendingTimeZoneEffectiveAt: v.number(),
});

export function getStoredHouseholdTimeZone(household: Partial<HouseholdTimeZoneSettings>): string {
  return household.timeZone ?? DEFAULT_HOUSEHOLD_TIME_ZONE;
}

export function getEffectiveTimeZone(
  household: Partial<HouseholdTimeZoneSettings>,
  at: number,
): string {
  if (
    household.pendingTimeZone &&
    household.pendingTimeZoneEffectiveAt !== undefined &&
    at >= household.pendingTimeZoneEffectiveAt
  ) {
    return household.pendingTimeZone;
  }

  return getStoredHouseholdTimeZone(household);
}

export function getNextLocalMidnightTimestamp(timestamp: number, timeZone: string): number {
  const currentLocalDate = getLocalDateKey(timestamp, timeZone);
  const nextLocalDate = getNextLocalDate(currentLocalDate, timeZone);

  return getLocalDayBounds(nextLocalDate, timeZone).startTimestamp;
}

export function shouldPromotePendingTimeZone(
  household: Partial<HouseholdTimeZoneSettings>,
  at: number,
): boolean {
  return (
    household.pendingTimeZone !== undefined &&
    household.pendingTimeZoneEffectiveAt !== undefined &&
    at >= household.pendingTimeZoneEffectiveAt
  );
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const createHousehold = mutation({
  args: {
    name: v.string(),
    timeZone: v.optional(v.string()),
  },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    if (user.householdId) {
      throw new Error("User already belongs to a household");
    }

    const timeZone = args.timeZone ?? DEFAULT_HOUSEHOLD_TIME_ZONE;

    if (!isValidTimeZone(timeZone)) {
      throw new Error("Invalid time zone");
    }

    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      name: args.name,
      inviteCode: generateInviteCode(),
      ownerId: user._id,
      createdAt: now,
      allowance: 55,
      allowanceCents: 5_500n,
      timeZone,
      moneyMigrationCompletedAt: now,
    });

    await ctx.db.patch(user._id, {
      householdId,
      role: "owner",
    });

    return householdId;
  },
});

export const updateTimeZone = mutation({
  args: {
    timeZone: v.string(),
  },
  returns: timeZoneUpdateResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    if (household.ownerId !== user._id) {
      throw new Error("Only the household owner can change the budget timezone");
    }

    if (!isValidTimeZone(args.timeZone)) {
      throw new Error("Invalid time zone");
    }

    const currentTimeZone = getEffectiveTimeZone(household, now);

    let pendingTimeZoneEffectiveAt: number;

    if (
      household.pendingTimeZoneEffectiveAt !== undefined &&
      now < household.pendingTimeZoneEffectiveAt
    ) {
      pendingTimeZoneEffectiveAt = household.pendingTimeZoneEffectiveAt;
    } else {
      pendingTimeZoneEffectiveAt = getNextLocalMidnightTimestamp(now, currentTimeZone);
    }

    await ctx.db.patch(household._id, {
      pendingTimeZone: args.timeZone,
      pendingTimeZoneEffectiveAt,
    });

    return {
      currentTimeZone,
      pendingTimeZone: args.timeZone,
      pendingTimeZoneEffectiveAt,
    };
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
