<script setup lang="ts">
import { computed } from "vue";
import type { Doc, Id } from "@generated/dataModel";
import { getGoalStatusStrategy, type GoalStatus } from "../../utils/goal-status";
import GoalsStatusBadge from "./status-badge.vue";
import type { ActiveAllocation } from "../../utils/goal-allocations";

type Goal = Doc<"goals">;

const props = defineProps<{
  item: Goal;
  allocation?: ActiveAllocation;
  reorderable?: boolean;
  reorderPending?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const emit = defineEmits<{
  (event: "move-up", goalId: Id<"goals">): void;
  (event: "move-down", goalId: Id<"goals">): void;
  (event: "edit", item: Goal): void;
  (event: "purchase", item: Goal): void;
  (
    event: "change-status",
    value: {
      goalId: Id<"goals">;
      status: GoalStatus;
    },
  ): void;
}>();

const strategy = computed(() => getGoalStatusStrategy(props.item.status));

const priorityLabel = computed(() => {
  return `${props.item.priority.charAt(0).toUpperCase()}${props.item.priority.slice(1)} priority`;
});
</script>

<template>
  <article class="panel l-stack" data-test="goal-item">
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

      <GoalsStatusBadge :status="item.status" />
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
        v-if="item.status === 'saving'"
        type="button"
        :aria-label="`Purchase ${item.name}`"
        @click="emit('purchase', item)"
      >
        Purchase
      </button>

      <button
        v-if="item.status !== 'purchased'"
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
              :aria-label="`Move ${item.name} to ${getGoalStatusStrategy(targetStatus).label}`"
              @click="
                emit('change-status', {
                  goalId: item._id,
                  status: targetStatus,
                })
              "
            >
              {{ getGoalStatusStrategy(targetStatus).label }}
            </button>
          </li>
        </ul>
      </details>
    </div>
  </article>
</template>
