<script setup lang="ts">
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { computed, ref, useId, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import type { WantStatus } from "../../utils/want-status";
import WantsItem from "./item.vue";

type WantItem = Doc<"goals">;
type SavingsSummary = FunctionReturnType<typeof api.savings.getSummary>;
type ActiveAllocation = SavingsSummary["activeAllocations"][number];

const props = withDefaults(
  defineProps<{
    title: string;
    items: WantItem[];
    allocations?: ActiveAllocation[];
    reorderable?: boolean;
    reorderPending?: boolean;
    reorderError?: string;
  }>(),
  {
    allocations: () => [],
    reorderable: false,
    reorderPending: false,
    reorderError: "",
  },
);

const emit = defineEmits<{
  (event: "reorder", order: FunctionArgs<typeof api.goals.reorder>): void;
  (event: "edit", item: WantItem): void;
  (event: "purchase", item: WantItem): void;
  (
    event: "change-status",
    value: {
      goalId: Id<"goals">;
      status: WantStatus;
    },
  ): void;
}>();

const headingId = useId();
const instructionsId = useId();
const localItems = ref<WantItem[]>([]);
const dragSnapshot = ref<WantItem[] | null>(null);
const isDragging = ref(false);

const allocationsByItem = computed(() => {
  return new Map(props.allocations.map((allocation) => [allocation.goalId, allocation]));
});

watch(
  () => props.items,
  (items) => {
    if (!isDragging.value) {
      localItems.value = [...items];
    }
  },
  { immediate: true },
);

watch(
  () => props.reorderError,
  (error) => {
    if (!error) return;

    isDragging.value = false;
    dragSnapshot.value = null;
    localItems.value = [...props.items];
  },
);

function hasSameOrder(first: WantItem[], second: WantItem[]) {
  return (
    first.length === second.length && first.every((item, index) => item._id === second[index]?._id)
  );
}

function emitCurrentOrder(previousItems: WantItem[]) {
  emit("reorder", {
    expectedGoalIds: previousItems.map((item) => item._id),
    goalIds: localItems.value.map((item) => item._id),
  });
}

function onDragStart() {
  if (props.reorderPending) return;

  dragSnapshot.value = [...localItems.value];
  isDragging.value = true;
}

function onDragEnd() {
  isDragging.value = false;

  if (props.reorderPending) {
    dragSnapshot.value = null;
    localItems.value = [...props.items];
    return;
  }

  const previousOrder = dragSnapshot.value ?? [...props.items];
  dragSnapshot.value = null;

  if (hasSameOrder(previousOrder, localItems.value)) {
    localItems.value = [...props.items];
    return;
  }

  emitCurrentOrder(previousOrder);
}

function moveItem(goalId: Id<"goals">, direction: -1 | 1) {
  if (props.reorderPending) return;

  const currentIndex = localItems.value.findIndex((item) => item._id === goalId);
  const targetIndex = currentIndex + direction;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= localItems.value.length) {
    return;
  }

  const previousItems = localItems.value;
  const nextItems = [...previousItems];
  const [movedItem] = nextItems.splice(currentIndex, 1);

  if (!movedItem) return;

  nextItems.splice(targetIndex, 0, movedItem);
  localItems.value = nextItems;
  emitCurrentOrder(previousItems);
}
</script>

<template>
  <section
    class="l-stack"
    :aria-labelledby="headingId"
    :aria-label="title"
    :aria-busy="reorderPending ? 'true' : undefined"
  >
    <header class="l-cluster l-split">
      <div>
        <h2 :id="headingId">
          {{ title }}
        </h2>

        <p v-if="reorderable" :id="instructionsId">
          Drag a handle or use the Move up and Move down buttons.
        </p>
      </div>

      <p v-if="reorderPending" role="status" aria-live="polite">Saving order…</p>
    </header>

    <p v-if="reorderError" role="alert" aria-live="polite">
      {{ reorderError }}
    </p>

    <p v-if="localItems.length === 0">No items in {{ title }}.</p>

    <VueDraggable
      v-else
      v-model="localItems"
      tag="div"
      handle=".want-drag-handle"
      :animation="150"
      :disabled="!reorderable || reorderPending"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <div class="l-stack" v-for="(item, index) in localItems" :key="item._id">
        <button
          v-if="reorderable"
          class="want-drag-handle"
          type="button"
          :disabled="reorderPending"
          :aria-label="`Drag ${item.name} to reorder`"
          :aria-describedby="instructionsId"
        >
          Drag
        </button>

        <WantsItem
          :item="item"
          :allocation="allocationsByItem.get(item._id)"
          :reorderable="reorderable"
          :reorder-pending="reorderPending"
          :is-first="index === 0"
          :is-last="index === localItems.length - 1"
          @move-up="moveItem($event, -1)"
          @move-down="moveItem($event, 1)"
          @edit="emit('edit', $event)"
          @purchase="emit('purchase', $event)"
          @change-status="emit('change-status', $event)"
        />
      </div>
    </VueDraggable>
  </section>
</template>
