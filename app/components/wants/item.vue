<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { computed } from "vue";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import { getWantStatusStrategy, type WantStatus } from "../../utils/want-status";
import WantsStatusBadge from "./status-badge.vue";

type WantItem = Doc<"wantItems">;
type ReserveSummary = FunctionReturnType<typeof api.reserve.getSummary>;
type ActiveAllocation = ReserveSummary["activeAllocations"][number];

const props = defineProps<{
  item: WantItem;
  allocation?: ActiveAllocation;
  reorderable?: boolean;
  reorderPending?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const emit = defineEmits<{
  (event: "move-up", itemId: Id<"wantItems">): void;
  (event: "move-down", itemId: Id<"wantItems">): void;
  (event: "edit", item: WantItem): void;
  (event: "purchase", item: WantItem): void;
  (
    event: "change-status",
    value: {
      itemId: Id<"wantItems">;
      status: WantStatus;
    },
  ): void;
}>();

const strategy = computed(() => getWantStatusStrategy(props.item.status));

const priorityLabel = computed(() => {
  return `${props.item.priority.charAt(0).toUpperCase()}${props.item.priority.slice(1)} priority`;
});
</script>

<template>
  <article
    data-test="want-item"
    class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate text-lg font-bold">
          {{ item.name }}
        </h3>

        <p class="mt-1 text-sm text-base-content/65">
          {{ priorityLabel }}
          <span aria-hidden="true"> · </span>
          {{ formatCents(item.estimatedCostCents) }}
        </p>
      </div>

      <WantsStatusBadge :status="item.status" />
    </div>

    <p class="mt-3 text-sm text-base-content/70">
      {{ strategy.description }}
    </p>

    <p v-if="item.notes" class="mt-3 whitespace-pre-wrap text-sm">
      {{ item.notes }}
    </p>

    <div v-if="allocation" class="mt-4 space-y-2">
      <div class="flex flex-wrap justify-between gap-2 text-sm">
        <span class="font-semibold">Reserve progress</span>
        <span>
          {{ formatCents(allocation.allocatedCents) }} of
          {{ formatCents(item.estimatedCostCents) }}
        </span>
      </div>

      <progress
        class="progress progress-primary w-full"
        :aria-label="`${item.name} funding progress`"
        :value="allocation.progressBasisPoints"
        max="10000"
      >
        {{ allocation.progressBasisPoints / 100 }}%
      </progress>

      <p class="text-xs text-base-content/60">
        {{ formatCents(allocation.remainingCents) }} remaining
      </p>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <template v-if="reorderable">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :aria-label="`Move ${item.name} up`"
          :disabled="reorderPending || isFirst"
          @click="emit('move-up', item._id)"
        >
          Move up
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :aria-label="`Move ${item.name} down`"
          :disabled="reorderPending || isLast"
          @click="emit('move-down', item._id)"
        >
          Move down
        </button>
      </template>

      <button
        v-if="item.status === 'plan_for_it'"
        type="button"
        class="btn btn-primary btn-sm"
        :aria-label="`Purchase ${item.name}`"
        @click="emit('purchase', item)"
      >
        Purchase
      </button>

      <button
        v-if="item.status !== 'bought'"
        type="button"
        class="btn btn-ghost btn-sm"
        :aria-label="`Edit ${item.name}`"
        @click="emit('edit', item)"
      >
        Edit
      </button>

      <details v-if="strategy.allowedActions.length" class="dropdown">
        <summary class="btn btn-ghost btn-sm">Change status</summary>

        <ul
          class="menu dropdown-content z-10 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow"
        >
          <li v-for="targetStatus in strategy.allowedActions" :key="targetStatus">
            <button
              type="button"
              :aria-label="`Move ${item.name} to ${getWantStatusStrategy(targetStatus).label}`"
              @click="
                emit('change-status', {
                  itemId: item._id,
                  status: targetStatus,
                })
              "
            >
              {{ getWantStatusStrategy(targetStatus).label }}
            </button>
          </li>
        </ul>
      </details>
    </div>
  </article>
</template>
