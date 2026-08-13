<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { formatMoney } from "../../../shared/utils/format-money";
import { VueDraggable } from "vue-draggable-plus";

type Debt = Doc<"debts">;
type DragEvent = {
  oldIndex?: number;
  newIndex?: number;
};

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
const { depts, update, remove, reorder } = useDepts();

const drawerToggles = ref<HTMLInputElement[]>([]);
const localDepts = ref<Debt[]>([]);
const latestServerDepts = ref<Debt[]>([]);
const hasServerSnapshot = ref(false);
const dragSnapshot = ref<Debt[] | null>(null);
const isDragging = ref(false);
const isSavingOrder = ref(false);
const orderStatus = ref("");
const reorderError = ref("");
const dragAnimation = ref(150);
const transparentDragImage = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    dragAnimation.value = 0;
  }
});

watch(
  depts,
  (newVal) => {
    if (!newVal) return;

    latestServerDepts.value = [...newVal];
    hasServerSnapshot.value = true;

    if (!isDragging.value && !isSavingOrder.value) {
      localDepts.value = [...newVal];
    }
  },
  { immediate: true },
);

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Debt>();
const columns = columnHelper.columns([
  columnHelper.display({
    id: "drag",
    header: "Order",
  }),
  columnHelper.accessor("isPriority", {
    header: "In Snowball",
  }),
  columnHelper.accessor("creditor", {
    header: "Creditor",
    cell: (context) => context.getValue(),
  }),
  columnHelper.accessor("payment", {
    header: "Payment",
    cell: (context) => formatMoney(context.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
  }),
]);

const table = useTable({
  features,
  columns,
  data: localDepts,
  getRowId: (row) => row._id,
});

function hasSameOrder(first: Debt[], second: Debt[]) {
  return (
    first.length === second.length && first.every((debt, index) => debt._id === second[index]?._id)
  );
}

function getDebtPosition(id: Id<"debts">) {
  return localDepts.value.findIndex((debt) => debt._id === id) + 1;
}

function getReorderLabel(debt: Debt) {
  return `Move ${debt.creditor}, position ${getDebtPosition(debt._id)} of ${localDepts.value.length}`;
}

function suppressNativeDragPreview(dataTransfer: DataTransfer) {
  dataTransfer.setData("text/plain", "");

  if (transparentDragImage.value) {
    dataTransfer.setDragImage(transparentDragImage.value, 0, 0);
  }
}

async function saveOrder(previousOrder: Debt[], movedDebt?: Debt) {
  if (isSavingOrder.value) return;

  isSavingOrder.value = true;
  reorderError.value = "";
  orderStatus.value = "Saving order…";

  try {
    await reorder({
      orderedIds: localDepts.value.map((debt) => debt._id),
    });

    latestServerDepts.value = [...localDepts.value];
    hasServerSnapshot.value = true;
    orderStatus.value = movedDebt
      ? `${movedDebt.creditor} moved to position ${getDebtPosition(movedDebt._id)}. Order saved.`
      : "Debt order saved.";
  } catch {
    const fallbackOrder = hasServerSnapshot.value ? latestServerDepts.value : previousOrder;
    localDepts.value = [...fallbackOrder];
    orderStatus.value = "";
    reorderError.value = "Order couldn’t be saved. The last saved order has been restored.";
  } finally {
    isSavingOrder.value = false;
  }
}

function onDragStart(event: DragEvent) {
  dragSnapshot.value = [...localDepts.value];
  isDragging.value = true;
  reorderError.value = "";

  const debt = typeof event.oldIndex === "number" ? localDepts.value[event.oldIndex] : undefined;
  orderStatus.value = debt ? `Moving ${debt.creditor}.` : "Moving debt.";
}

async function onDragEnd(event: DragEvent) {
  const previousOrder = dragSnapshot.value ?? [...latestServerDepts.value];
  dragSnapshot.value = null;
  isDragging.value = false;

  if (hasSameOrder(previousOrder, localDepts.value)) {
    localDepts.value = [...latestServerDepts.value];
    orderStatus.value = "Order unchanged.";
    return;
  }

  const movedDebt =
    typeof event.newIndex === "number" ? localDepts.value[event.newIndex] : undefined;
  await saveOrder(previousOrder, movedDebt);
}

async function moveDebt(id: Id<"debts">, direction: -1 | 1) {
  if (isDragging.value || isSavingOrder.value) return;

  const currentIndex = localDepts.value.findIndex((debt) => debt._id === id);
  const targetIndex = currentIndex + direction;
  const debt = localDepts.value[currentIndex];

  if (!debt) return;

  if (targetIndex < 0 || targetIndex >= localDepts.value.length) {
    orderStatus.value = `${debt.creditor} is already ${direction < 0 ? "first" : "last"}.`;
    return;
  }

  const previousOrder = [...localDepts.value];
  const nextOrder = [...localDepts.value];
  const [movedDebt] = nextOrder.splice(currentIndex, 1);

  if (!movedDebt) return;

  nextOrder.splice(targetIndex, 0, movedDebt);
  localDepts.value = nextOrder;
  await nextTick();
  await saveOrder(previousOrder, movedDebt);
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
async function onPriorityToggle(id: Id<"debts">, value: boolean) {
  if (!id) return;
  await update({ id, isPriority: value });
}

function closeDrawer(id: Id<"debts">) {
  const toggle = drawerToggles.value.find((el) => el?.id === id);
  if (toggle) toggle.checked = false;
}

function openDrawer(id: Id<"debts">) {
  const toggle = drawerToggles.value.find((el) => el?.id === id);
  if (toggle) toggle.checked = true;
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onEditSaved(id: Id<"debts">) {
  if (!id) return;
  closeDrawer(id);
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onDelete(id: Id<"debts">) {
  remove({ id });
}
</script>

<template>
  <section aria-labelledby="debt-order-heading" class="space-y-3">
    <canvas
      ref="transparentDragImage"
      aria-hidden="true"
      width="1"
      height="1"
      class="pointer-events-none fixed left-0 top-0 size-px opacity-0"
    ></canvas>
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id="debt-order-heading" class="text-lg font-semibold">Debt payoff order</h2>
        <p id="debt-reorder-instructions" class="text-sm text-base-content/65">
          Drag a grip, or focus it and use the up and down arrow keys.
        </p>
      </div>
      <p aria-live="polite" role="status" class="min-h-5 text-sm text-base-content/70">
        <span
          v-if="isSavingOrder"
          class="loading loading-spinner loading-xs mr-1"
          aria-hidden="true"
        ></span>
        {{ orderStatus }}
      </p>
    </div>

    <div v-if="reorderError" role="alert" class="alert alert-error py-3 text-sm">
      <Icon name="lucide:triangle-alert" size="18" aria-hidden="true" />
      <span>{{ reorderError }}</span>
    </div>

    <div class="overflow-x-auto rounded-box border border-base-300">
      <table class="table w-full min-w-3xl">
        <caption class="sr-only">
          Debts in payoff order with snowball, payment, edit, and delete controls.
        </caption>
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="header.column.id === 'creditor' ? 'w-full' : undefined"
            >
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
          </tr>
        </thead>
        <tbody v-if="localDepts.length === 0">
          <tr>
            <td colspan="5" class="py-8 text-center text-base-content/60">
              Add a debt to start building your payoff order.
            </td>
          </tr>
        </tbody>
        <VueDraggable
          v-else
          v-model="localDepts"
          tag="tbody"
          handle=".drag-handle"
          :animation="dragAnimation"
          :disabled="isSavingOrder"
          :set-data="suppressNativeDragPreview"
          ghost-class="debt-row-ghost"
          chosen-class="debt-row-chosen"
          @start="onDragStart"
          @end="onDragEnd"
        >
          <tr v-for="row in table.getRowModel().rows" :key="row.id" class="debt-row">
            <td
              v-for="cell in row.getAllCells()"
              :key="cell.id"
              :class="{
                'w-20': cell.column.id === 'drag',
                'flex min-w-28 gap-2': cell.column.id === 'actions',
              }"
            >
              <template v-if="cell.column.id === 'drag'">
                <button
                  type="button"
                  class="drag-handle btn btn-ghost btn-sm min-h-11 min-w-11 cursor-grab touch-none active:cursor-grabbing"
                  :aria-disabled="isSavingOrder"
                  :aria-label="getReorderLabel(row.original)"
                  aria-describedby="debt-reorder-instructions"
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  :title="`Move ${row.original.creditor}`"
                  @keydown.up.prevent="moveDebt(row.original._id, -1)"
                  @keydown.down.prevent="moveDebt(row.original._id, 1)"
                >
                  <Icon name="lucide:grip-vertical" size="20" aria-hidden="true" />
                </button>
              </template>
              <template v-else-if="cell.column.id === 'isPriority'">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm min-h-11 min-w-11"
                  @click="onPriorityToggle(row.original._id, !row.original.isPriority)"
                  :aria-label="`${row.original.isPriority ? 'Remove' : 'Add'} ${row.original.creditor} ${row.original.isPriority ? 'from' : 'to'} the snowball`"
                >
                  <Icon
                    v-if="row.original.isPriority"
                    name="lucide:circle-check"
                    size="24"
                    class="text-success"
                    aria-hidden="true"
                  />
                  <Icon
                    v-else
                    name="lucide:circle-x"
                    size="24"
                    class="text-error"
                    aria-hidden="true"
                  />
                </button>
              </template>
              <template v-else-if="cell.column.id === 'actions'">
                <div class="drawer drawer-end w-full">
                  <input
                    ref="drawerToggles"
                    :id="row.id"
                    type="checkbox"
                    class="drawer-toggle w-full"
                  />
                  <div class="drawer-content">
                    <button
                      type="button"
                      class="drawer-button btn btn-circle"
                      @click="openDrawer(row.original._id)"
                      :aria-label="`Edit ${row.original.creditor}`"
                      :title="`Edit ${row.original.creditor}`"
                    >
                      <Icon
                        name="i-material-symbols:edit-square-outline-rounded"
                        size="24"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div class="drawer-side">
                    <label :for="row.id" aria-label="close sidebar" class="drawer-overlay"></label>
                    <div class="menu bg-base-200 min-h-full w-80 p-4">
                      <lazy-depts-edit :depts="row.original" @updated="onEditSaved" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  @click="onDelete(row.original._id)"
                  class="btn btn-circle"
                  :aria-label="`Delete ${row.original.creditor}`"
                  :title="`Delete ${row.original.creditor}`"
                >
                  <Icon
                    name="i-material-symbols:delete-forever-outline-rounded"
                    size="24"
                    class="text-error/30"
                    aria-hidden="true"
                  />
                </button>
              </template>
              <FlexRender v-else :cell="cell" />
            </td>
          </tr>
        </VueDraggable>
      </table>
    </div>
  </section>
</template>

<style scoped>
.debt-row-ghost {
  background: var(--color-base-200);
  opacity: 0.4;
}

.debt-row-chosen {
  background: color-mix(in oklab, var(--color-primary) 8%, var(--color-base-100));
}

@media (prefers-reduced-motion: no-preference) {
  .debt-row {
    transition:
      background-color 150ms ease,
      opacity 150ms ease;
  }
}
</style>
