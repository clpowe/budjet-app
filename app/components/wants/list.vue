<script setup lang="ts">
import type { FunctionReturnType } from "convex/server";
import { computed, ref, useId, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import type { WantStatus } from "../../utils/want-status";
import WantsItem from "./item.vue";

type WantItem = Doc<"wantItems">;
type ReserveSummary = FunctionReturnType<typeof api.reserve.getSummary>;
type ActiveAllocation = ReserveSummary["activeAllocations"][number];

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
  (event: "reorder", itemIds: Id<"wantItems">[]): void;
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

const headingId = useId();
const instructionsId = useId();
const localItems = ref<WantItem[]>([]);
const dragSnapshot = ref<WantItem[] | null>(null);
const isDragging = ref(false);

const allocationsByItem = computed(() => {
  return new Map(props.allocations.map((allocation) => [allocation.itemId, allocation]));
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

function emitCurrentOrder() {
  emit(
    "reorder",
    localItems.value.map((item) => item._id),
  );
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
    return;
  }

  emitCurrentOrder();
}

function moveItem(itemId: Id<"wantItems">, direction: -1 | 1) {
  if (props.reorderPending) return;

  const currentIndex = localItems.value.findIndex((item) => item._id === itemId);
  const targetIndex = currentIndex + direction;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= localItems.value.length) {
    return;
  }

  const nextItems = [...localItems.value];
  const [movedItem] = nextItems.splice(currentIndex, 1);

  if (!movedItem) return;

  nextItems.splice(targetIndex, 0, movedItem);
  localItems.value = nextItems;
  emitCurrentOrder();
}
</script>

<template>
  <section
    :aria-labelledby="headingId"
    :aria-label="title"
    :aria-busy="reorderPending ? 'true' : undefined"
    class="space-y-3"
  >
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 :id="headingId" class="text-xl font-bold">
          {{ title }}
        </h2>

        <p v-if="reorderable" :id="instructionsId" class="mt-1 text-sm text-base-content/65">
          Drag a handle or use the Move up and Move down buttons.
        </p>
      </div>

      <p
        v-if="reorderPending"
        role="status"
        aria-live="polite"
        class="text-sm text-base-content/65"
      >
        Saving order…
      </p>
    </div>

    <p v-if="reorderError" role="alert" aria-live="polite" class="alert alert-error text-sm">
      {{ reorderError }}
    </p>

    <p
      v-if="localItems.length === 0"
      class="rounded-xl border border-dashed border-base-300 p-5 text-sm text-base-content/60"
    >
      No items in {{ title }}.
    </p>

    <VueDraggable
      v-else
      v-model="localItems"
      tag="div"
      class="space-y-3"
      handle=".want-drag-handle"
      :animation="150"
      :disabled="!reorderable || reorderPending"
      ghost-class="want-item-ghost"
      chosen-class="want-item-chosen"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <div
        v-for="(item, index) in localItems"
        :key="item._id"
        class="grid items-start gap-2"
        :class="reorderable ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'"
      >
        <button
          v-if="reorderable"
          type="button"
          class="want-drag-handle btn btn-ghost btn-square mt-1 cursor-grab touch-none active:cursor-grabbing"
          :disabled="reorderPending"
          :aria-label="`Drag ${item.name} to reorder`"
          :aria-describedby="instructionsId"
        >
          <Icon name="lucide:grip-vertical" size="20" aria-hidden="true" />
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

<style scoped>
.want-item-ghost {
  opacity: 0.4;
}

.want-item-chosen {
  background: color-mix(in oklab, var(--color-primary) 8%, transparent);
}
</style>
