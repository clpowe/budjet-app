<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { computed } from "vue";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import { getWantStatusStrategy, type WantStatus } from "../../utils/want-status";
import WantsStatusBadge from "./status-badge.vue";

type WantItem = Doc<"wantItems">;
type SavingsSummary = FunctionReturnType<typeof api.savings.getSummary>;
type ActiveAllocation = SavingsSummary["activeAllocations"][number];

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
  <article class="panel l-stack" data-test="want-item">
    <header class="l-cluster l-split">
      <div>
        <h3>
          {{ item.name }}
        </h3>

        <p>
          {{ priorityLabel }}
          <span aria-hidden="true"> · </span>
          {{ formatCents(item.estimatedCostCents) }}
        </p>
      </div>

      <WantsStatusBadge :status="item.status" />
    </header>

    <p>
      {{ strategy.description }}
    </p>

    <p v-if="item.notes">
      {{ item.notes }}
    </p>

    <div v-if="allocation">
      <div>
        <span>Savings progress</span>
        <span>
          {{ formatCents(allocation.allocatedCents) }} of
          {{ formatCents(item.estimatedCostCents) }}
        </span>
      </div>

      <progress
        :aria-label="`${item.name} funding progress`"
        :value="allocation.progressBasisPoints"
        max="10000"
      >
        {{ allocation.progressBasisPoints / 100 }}%
      </progress>

      <p>{{ formatCents(allocation.remainingCents) }} remaining</p>
    </div>

    <div class="actions">
      <template v-if="reorderable">
        <button
          type="button"
          :aria-label="`Move ${item.name} up`"
          :disabled="reorderPending || isFirst"
          @click="emit('move-up', item._id)"
        >
          Move up
        </button>

        <button
          type="button"
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
        :aria-label="`Purchase ${item.name}`"
        @click="emit('purchase', item)"
      >
        Purchase
      </button>

      <button
        v-if="item.status !== 'bought'"
        type="button"
        :aria-label="`Edit ${item.name}`"
        @click="emit('edit', item)"
      >
        Edit
      </button>

      <details v-if="strategy.allowedActions.length">
        <summary>Change status</summary>

        <ul>
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
