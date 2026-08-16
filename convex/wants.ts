import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./lib/helpers";
import { getReorderUpdates } from "./lib/want_reserve";

export const MAX_ACTIVE_WANTS = 100;
export const INACTIVE_WANTS_PAGE_SIZE = 25;

const wantPriorityValidator = v.union(v.literal("high"), v.literal("medium"), v.literal("low"));

const wantStatusValidator = v.union(
  v.literal("considering"),
  v.literal("plan_for_it"),
  v.literal("not_now"),
  v.literal("bought"),
);

const inactiveWantStatusValidator = v.union(
  v.literal("considering"),
  v.literal("not_now"),
  v.literal("bought"),
);

const wantItemValidator = v.object({
  _id: v.id("wantItems"),
  _creationTime: v.number(),
  householdId: v.id("households"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  priority: wantPriorityValidator,
  targetDate: v.optional(v.number()),
  notes: v.string(),
  status: wantStatusValidator,
  order: v.optional(v.number()),
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  purchasedBy: v.optional(v.id("users")),
  purchasedAt: v.optional(v.number()),
  expenseId: v.optional(v.id("expenses")),
});

const changeStatusResultValidator = v.union(
  v.object({
    kind: v.literal("updated"),
    item: wantItemValidator,
  }),
  v.object({
    kind: v.literal("money_migration_pending"),
  }),
);

function normalizeName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Want name is required");
  }

  return normalizedName;
}

function normalizeNotes(notes: string): string {
  return notes.trim();
}

function assertPositiveCents(cents: bigint, label: string): void {
  if (cents <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
}

function assertFiniteTargetDate(targetDate: number | null): void {
  if (targetDate !== null && !Number.isFinite(targetDate)) {
    throw new Error("Target date must be finite");
  }
}

function assertInactivePageSize(numItems: number): void {
  if (numItems !== INACTIVE_WANTS_PAGE_SIZE) {
    throw new Error(`Inactive Want pages must contain ${INACTIVE_WANTS_PAGE_SIZE} items`);
  }
}

async function requireHouseholdWant(
  ctx: MutationCtx,
  wantItemId: Id<"wantItems">,
  householdId: Id<"households">,
): Promise<Doc<"wantItems">> {
  const wantItem = await ctx.db.get(wantItemId);

  if (!wantItem || wantItem.householdId !== householdId) {
    throw new Error("Want item not found");
  }

  return wantItem;
}

async function getActiveQueue(
  ctx: MutationCtx,
  householdId: Id<"households">,
): Promise<Doc<"wantItems">[]> {
  const active = await ctx.db
    .query("wantItems")
    .withIndex("by_household_and_status_and_order", (q) =>
      q.eq("householdId", householdId).eq("status", "plan_for_it"),
    )
    .order("asc")
    .take(MAX_ACTIVE_WANTS + 1);

  if (active.length > MAX_ACTIVE_WANTS) {
    throw new Error("Active Want queue exceeds its maximum size");
  }

  if (active.some((item) => item.order === undefined)) {
    throw new Error("Active Want queue contains an item without an order");
  }

  return active;
}

export const list = query({
  args: {},
  returns: v.object({
    active: v.array(wantItemValidator),
  }),
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    const householdId = user.householdId;

    if (!householdId) {
      throw new Error("User is not in a household");
    }

    const active = await ctx.db
      .query("wantItems")
      .withIndex("by_household_and_status_and_order", (q) =>
        q.eq("householdId", householdId).eq("status", "plan_for_it"),
      )
      .order("asc")
      .take(MAX_ACTIVE_WANTS + 1);

    if (active.length > MAX_ACTIVE_WANTS) {
      throw new Error("Active Want queue exceeds its maximum size");
    }

    if (active.some((item) => item.order === undefined)) {
      throw new Error("Active Want queue contains an item without an order");
    }

    return { active };
  },
});

export const listSection = query({
  args: {
    status: inactiveWantStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(wantItemValidator),
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const householdId = user.householdId;

    if (!householdId) {
      throw new Error("User is not in a household");
    }

    assertInactivePageSize(args.paginationOpts.numItems);

    return await ctx.db
      .query("wantItems")
      .withIndex("by_household_and_status", (q) =>
        q.eq("householdId", householdId).eq("status", args.status),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: wantPriorityValidator,
    targetDate: v.optional(v.number()),
    notes: v.string(),
  },
  returns: wantItemValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");

    if (args.targetDate !== undefined && !Number.isFinite(args.targetDate)) {
      throw new Error("Target date must be finite");
    }

    const wantItemId = await ctx.db.insert("wantItems", {
      householdId: user.householdId,
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      ...(args.targetDate !== undefined ? { targetDate: args.targetDate } : {}),
      notes: normalizeNotes(args.notes),
      status: "considering",
      createdBy: user._id,
      updatedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const wantItem = await ctx.db.get(wantItemId);

    if (!wantItem) {
      throw new Error("Failed to create Want item");
    }

    return wantItem;
  },
});

export const update = mutation({
  args: {
    itemId: v.id("wantItems"),
    name: v.string(),
    estimatedCostCents: v.int64(),
    priority: wantPriorityValidator,
    targetDate: v.union(v.number(), v.null()),
    notes: v.string(),
  },
  returns: wantItemValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const wantItem = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    if (wantItem.status === "bought") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    assertPositiveCents(args.estimatedCostCents, "Estimated cost");
    assertFiniteTargetDate(args.targetDate);

    await ctx.db.patch(wantItem._id, {
      name: normalizeName(args.name),
      estimatedCostCents: args.estimatedCostCents,
      priority: args.priority,
      targetDate: args.targetDate === null ? undefined : args.targetDate,
      notes: normalizeNotes(args.notes),
      updatedBy: user._id,
      updatedAt: now,
    });

    const updatedWantItem = await ctx.db.get(wantItem._id);

    if (!updatedWantItem) {
      throw new Error("Want item disappeared during update");
    }

    return updatedWantItem;
  },
});

export const changeStatus = mutation({
  args: {
    itemId: v.id("wantItems"),
    status: wantStatusValidator,
  },
  returns: changeStatusResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const wantItem = await requireHouseholdWant(ctx, args.itemId, user.householdId);

    const household = await ctx.db.get(user.householdId);

    if (!household) {
      throw new Error("Household not found");
    }

    if (
      args.status === "plan_for_it" &&
      wantItem.status !== "plan_for_it" &&
      household.moneyMigrationCompletedAt === undefined
    ) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillMoney.processHousehold, {
        householdId: household._id,
        expenseCursor: null,
        timeZone: null,
      });

      return {
        kind: "money_migration_pending" as const,
      };
    }

    if (wantItem.status === "bought" || args.status === "bought") {
      throw new Error("Bought items can only be changed through purchase actions");
    }

    let order = wantItem.order;

    if (args.status === "plan_for_it" && wantItem.status !== "plan_for_it") {
      const active = await getActiveQueue(ctx, user.householdId);

      if (active.length >= MAX_ACTIVE_WANTS) {
        throw new Error("Move an item to Considering or Not now before planning another purchase");
      }

      const lastActiveItem = active[active.length - 1];
      order = lastActiveItem ? (lastActiveItem.order ?? -1) + 1 : 0;
    } else if (wantItem.status === "plan_for_it" && args.status !== "plan_for_it") {
      order = undefined;
    }

    await ctx.db.patch(wantItem._id, {
      status: args.status,
      order,
      updatedBy: user._id,
      updatedAt: now,
    });

    const updatedWantItem = await ctx.db.get(wantItem._id);

    if (!updatedWantItem) {
      throw new Error("Want item disappeared during status change");
    }

    return {
      kind: "updated" as const,
      item: updatedWantItem,
    };
  },
});

export const reorder = mutation({
  args: {
    itemIds: v.array(v.id("wantItems")),
  },
  returns: v.object({
    success: v.literal(true),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await getAuthenticatedUser(ctx);

    if (!user.householdId) {
      throw new Error("User is not in a household");
    }

    const active = await getActiveQueue(ctx, user.householdId);
    const updates = getReorderUpdates(
      active.map((item) => item._id),
      args.itemIds,
    );
    const activeById = new Map(active.map((item) => [item._id, item]));

    for (const update of updates) {
      const current = activeById.get(update.id);

      if (!current) {
        throw new Error("Active Want queue changed while reordering");
      }

      if (current.order !== update.order) {
        await ctx.db.patch(update.id, {
          order: update.order,
          updatedBy: user._id,
          updatedAt: now,
        });
      }
    }

    return { success: true as const };
  },
});
