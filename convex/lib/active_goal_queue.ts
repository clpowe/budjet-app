import { assertPositiveCents } from "../../shared/utils/money-cents";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { allocateSavings, type GoalAllocation } from "../../shared/utils/goal-allocation";

export const MAX_ACTIVE_GOALS = 100;

type DatabaseCtx = QueryCtx | MutationCtx;
type InactiveWantStatus = Exclude<Doc<"goals">["status"], "saving">;

interface QueueMutationMetadata {
  actorId: Id<"users">;
  now: number;
}

interface AppendActiveGoalOptions extends QueueMutationMetadata {
  item: Doc<"goals">;
  queueFullErrorMessage?: string;
}

interface RemoveActiveGoalOptions extends QueueMutationMetadata {
  item: Doc<"goals">;
  nextStatus: InactiveWantStatus;
}

interface ReorderActiveGoalsOptions extends QueueMutationMetadata {
  householdId: Id<"households">;
  expectedGoalIds: readonly Id<"goals">[];
  goalIds: readonly Id<"goals">[];
}

export async function loadActiveGoalQueue(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
): Promise<Doc<"goals">[]> {
  const items = await ctx.db
    .query("goals")
    .withIndex("by_household_and_status_and_order", (q) =>
      q.eq("householdId", householdId).eq("status", "saving"),
    )
    .order("asc")
    .take(MAX_ACTIVE_GOALS + 1);

  assertValidActiveQueue(items);

  return items;
}

export function projectActiveGoalAllocations(
  availableCents: bigint,
  activeGoals: readonly Doc<"goals">[],
): GoalAllocation<Doc<"goals">>[] {
  return allocateSavings(availableCents, activeGoals);
}

export async function appendActiveGoal(
  ctx: MutationCtx,
  {
    item,
    actorId,
    now,
    queueFullErrorMessage = "Active Want queue has reached its maximum size",
  }: AppendActiveGoalOptions,
): Promise<void> {
  if (item.status === "saving") {
    throw new Error("Want item is already active");
  }

  assertPositiveCents(item.estimatedCostCents, "Estimated cost");

  const activeItems = await loadActiveGoalQueue(ctx, item.householdId);

  if (activeItems.length >= MAX_ACTIVE_GOALS) {
    throw new Error(queueFullErrorMessage);
  }

  await ctx.db.patch(item._id, {
    status: "saving",
    order: activeItems.length,
    updatedBy: actorId,
    updatedAt: now,
  });
}

export async function removeActiveGoal(
  ctx: MutationCtx,
  { item, nextStatus, actorId, now }: RemoveActiveGoalOptions,
): Promise<void> {
  if (item.status !== "saving") {
    throw new Error("Want item is not active");
  }

  const activeItems = await loadActiveGoalQueue(ctx, item.householdId);

  if (!activeItems.some((activeItem) => activeItem._id === item._id)) {
    throw new Error("Active Want queue does not contain the requested item");
  }

  await ctx.db.patch(item._id, {
    status: nextStatus,
    order: undefined,
    updatedBy: actorId,
    updatedAt: now,
  });

  const remainingItems = activeItems.filter((activeItem) => activeItem._id !== item._id);

  for (const [order, remainingItem] of remainingItems.entries()) {
    if (remainingItem.order !== order) {
      await ctx.db.patch(remainingItem._id, {
        order,
        updatedBy: actorId,
        updatedAt: now,
      });
    }
  }
}

export async function reorderActiveGoals(
  ctx: MutationCtx,
  { householdId, expectedGoalIds, goalIds, actorId, now }: ReorderActiveGoalsOptions,
): Promise<boolean> {
  const activeItems = await loadActiveGoalQueue(ctx, householdId);

  if (
    expectedGoalIds.length !== activeItems.length ||
    activeItems.some((item, index) => item._id !== expectedGoalIds[index])
  ) {
    return false;
  }

  if (new Set(goalIds).size !== goalIds.length) {
    throw new Error("Requested active item IDs must not contain duplicates");
  }

  if (goalIds.length !== activeItems.length) {
    throw new Error("Reorder must include every active item exactly once");
  }

  const activeById = new Map(activeItems.map((item) => [item._id, item]));

  if (goalIds.some((goalId) => !activeById.has(goalId))) {
    throw new Error("Reorder contains an item that is not active");
  }

  for (const [order, goalId] of goalIds.entries()) {
    const item = activeById.get(goalId);

    if (!item) {
      throw new Error("Active Want queue changed while reordering");
    }

    if (item.order !== order) {
      await ctx.db.patch(goalId, {
        order,
        updatedBy: actorId,
        updatedAt: now,
      });
    }
  }
  return true;
}

function assertValidActiveQueue(items: Doc<"goals">[]): void {
  if (items.length > MAX_ACTIVE_GOALS) {
    throw new Error("Active Want queue exceeds its maximum size");
  }

  const orders = new Set<number>();

  for (const item of items) {
    if (item.estimatedCostCents <= 0n) {
      throw new Error("Active Want queue contains a nonpositive estimated cost");
    }

    if (item.order === undefined) {
      throw new Error("Active Want queue contains an item without an order");
    }

    if (!Number.isSafeInteger(item.order) || item.order < 0) {
      throw new Error("Active Want queue contains an invalid order");
    }

    if (orders.has(item.order)) {
      throw new Error("Active Want queue contains duplicate ordering");
    }

    orders.add(item.order);
  }

  for (const [expectedOrder, item] of items.entries()) {
    if (item.order !== expectedOrder) {
      throw new Error("Active Want queue ordering is not contiguous");
    }
  }
}
