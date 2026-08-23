import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { allocateReserve } from "./want_reserve";

export const MAX_ACTIVE_WANTS = 100;

type DatabaseCtx = QueryCtx | MutationCtx;
type InactiveWantStatus = Exclude<Doc<"wantItems">["status"], "plan_for_it">;

interface QueueMutationMetadata {
  actorId: Id<"users">;
  now: number;
}

interface AppendActiveWantOptions extends QueueMutationMetadata {
  item: Doc<"wantItems">;
  queueFullErrorMessage?: string;
}

interface RemoveActiveWantOptions extends QueueMutationMetadata {
  item: Doc<"wantItems">;
  nextStatus: InactiveWantStatus;
}

interface ReorderActiveWantsOptions extends QueueMutationMetadata {
  householdId: Id<"households">;
  itemIds: readonly Id<"wantItems">[];
}

export interface ActiveWantAllocation {
  item: Doc<"wantItems">;
  allocatedCents: bigint;
  remainingCents: bigint;
  progressBasisPoints: number;
}

export function assertPositiveEstimatedCost(estimatedCostCents: bigint): void {
  if (estimatedCostCents <= 0n) {
    throw new Error("Estimated cost must be greater than zero");
  }
}

export async function loadActiveWantQueue(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
): Promise<Doc<"wantItems">[]> {
  const items = await ctx.db
    .query("wantItems")
    .withIndex("by_household_and_status_and_order", (q) =>
      q.eq("householdId", householdId).eq("status", "plan_for_it"),
    )
    .order("asc")
    .take(MAX_ACTIVE_WANTS + 1);

  assertValidActiveQueue(items);

  return items;
}

export function projectActiveWantAllocations(
  availableCents: bigint,
  activeItems: readonly Doc<"wantItems">[],
): ActiveWantAllocation[] {
  const allocations = allocateReserve(
    availableCents,
    activeItems.map((item) => ({
      id: item._id,
      estimatedCostCents: item.estimatedCostCents,
    })),
  );

  return allocations.map((allocation, index) => {
    const item = activeItems[index];

    if (item === undefined || item._id !== allocation.id) {
      throw new Error("Active Want allocation no longer matches the queue");
    }

    return {
      item,
      allocatedCents: allocation.allocatedCents,
      remainingCents: allocation.remainingCents,
      progressBasisPoints: getProgressBasisPoints(
        allocation.allocatedCents,
        item.estimatedCostCents,
      ),
    };
  });
}

export async function appendActiveWant(
  ctx: MutationCtx,
  {
    item,
    actorId,
    now,
    queueFullErrorMessage = "Active Want queue has reached its maximum size",
  }: AppendActiveWantOptions,
): Promise<void> {
  if (item.status === "plan_for_it") {
    throw new Error("Want item is already active");
  }

  assertPositiveEstimatedCost(item.estimatedCostCents);

  const activeItems = await loadActiveWantQueue(ctx, item.householdId);

  if (activeItems.length >= MAX_ACTIVE_WANTS) {
    throw new Error(queueFullErrorMessage);
  }

  await ctx.db.patch(item._id, {
    status: "plan_for_it",
    order: activeItems.length,
    updatedBy: actorId,
    updatedAt: now,
  });
}

export async function removeActiveWant(
  ctx: MutationCtx,
  { item, nextStatus, actorId, now }: RemoveActiveWantOptions,
): Promise<void> {
  if (item.status !== "plan_for_it") {
    throw new Error("Want item is not active");
  }

  const activeItems = await loadActiveWantQueue(ctx, item.householdId);

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

export async function reorderActiveWants(
  ctx: MutationCtx,
  { householdId, itemIds, actorId, now }: ReorderActiveWantsOptions,
): Promise<void> {
  const activeItems = await loadActiveWantQueue(ctx, householdId);

  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Requested active item IDs must not contain duplicates");
  }

  if (itemIds.length !== activeItems.length) {
    throw new Error("Reorder must include every active item exactly once");
  }

  const activeById = new Map(activeItems.map((item) => [item._id, item]));

  if (itemIds.some((itemId) => !activeById.has(itemId))) {
    throw new Error("Reorder contains an item that is not active");
  }

  for (const [order, itemId] of itemIds.entries()) {
    const item = activeById.get(itemId);

    if (!item) {
      throw new Error("Active Want queue changed while reordering");
    }

    if (item.order !== order) {
      await ctx.db.patch(itemId, {
        order,
        updatedBy: actorId,
        updatedAt: now,
      });
    }
  }
}

function assertValidActiveQueue(items: Doc<"wantItems">[]): void {
  if (items.length > MAX_ACTIVE_WANTS) {
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

function getProgressBasisPoints(allocatedCents: bigint, estimatedCostCents: bigint): number {
  assertPositiveEstimatedCost(estimatedCostCents);

  return Number((allocatedCents * 10_000n) / estimatedCostCents);
}
