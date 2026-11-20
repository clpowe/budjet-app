<script setup lang="ts">
import { FlexRender, createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { formatCents } from "../../../shared/utils/money-cents";
import { VueDraggable } from "vue-draggable-plus";

type Debt = Doc<"debts">;
type DragEvent = {
  oldIndex?: number;
  newIndex?: number;
};

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
const { debts, update, remove, reorder } = useDebts();

const editDialogs = ref<HTMLDialogElement[]>([]);
const localDebts = ref<Debt[]>([]);
const latestServerDebts = ref<Debt[]>([]);
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
  debts,
  (newVal) => {
    if (!newVal) return;

    latestServerDebts.value = [...newVal];
    hasServerSnapshot.value = true;

    if (!isDragging.value && !isSavingOrder.value) {
      localDebts.value = [...newVal];
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
  columnHelper.accessor("paymentCents", {
    id: "payment",
    header: "Payment",
    cell: (context) => formatCents(context.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
  }),
]);

const table = useTable({
  features,
  columns,
  data: localDebts,
  getRowId: (row) => row._id,
});

function hasSameOrder(first: Debt[], second: Debt[]) {
  return (
    first.length === second.length && first.every((debt, index) => debt._id === second[index]?._id)
  );
}

function getDebtPosition(id: Id<"debts">) {
  return localDebts.value.findIndex((debt) => debt._id === id) + 1;
}

function getReorderLabel(debt: Debt) {
  return `Move ${debt.creditor}, position ${getDebtPosition(debt._id)} of ${localDebts.value.length}`;
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
      orderedIds: localDebts.value.map((debt) => debt._id),
    });

    latestServerDebts.value = [...localDebts.value];
    hasServerSnapshot.value = true;
    orderStatus.value = movedDebt
      ? `${movedDebt.creditor} moved to position ${getDebtPosition(movedDebt._id)}. Order saved.`
      : "Debt order saved.";
  } catch {
    const fallbackOrder = hasServerSnapshot.value ? latestServerDebts.value : previousOrder;
    localDebts.value = [...fallbackOrder];
    orderStatus.value = "";
    reorderError.value = "Order couldn’t be saved. The last saved order has been restored.";
  } finally {
    isSavingOrder.value = false;
  }
}

function onDragStart(event: DragEvent) {
  dragSnapshot.value = [...localDebts.value];
  isDragging.value = true;
  reorderError.value = "";

  const debt = typeof event.oldIndex === "number" ? localDebts.value[event.oldIndex] : undefined;
  orderStatus.value = debt ? `Moving ${debt.creditor}.` : "Moving debt.";
}

async function onDragEnd(event: DragEvent) {
  const previousOrder = dragSnapshot.value ?? [...latestServerDebts.value];
  dragSnapshot.value = null;
  isDragging.value = false;

  if (hasSameOrder(previousOrder, localDebts.value)) {
    localDebts.value = [...latestServerDebts.value];
    orderStatus.value = "Order unchanged.";
    return;
  }

  const movedDebt =
    typeof event.newIndex === "number" ? localDebts.value[event.newIndex] : undefined;
  await saveOrder(previousOrder, movedDebt);
}

async function moveDebt(id: Id<"debts">, direction: -1 | 1) {
  if (isDragging.value || isSavingOrder.value) return;

  const currentIndex = localDebts.value.findIndex((debt) => debt._id === id);
  const targetIndex = currentIndex + direction;
  const debt = localDebts.value[currentIndex];

  if (!debt) return;

  if (targetIndex < 0 || targetIndex >= localDebts.value.length) {
    orderStatus.value = `${debt.creditor} is already ${direction < 0 ? "first" : "last"}.`;
    return;
  }

  const previousOrder = [...localDebts.value];
  const nextOrder = [...localDebts.value];
  const [movedDebt] = nextOrder.splice(currentIndex, 1);

  if (!movedDebt) return;

  nextOrder.splice(targetIndex, 0, movedDebt);
  localDebts.value = nextOrder;
  await nextTick();
  await saveOrder(previousOrder, movedDebt);
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
async function onPriorityToggle(id: Id<"debts">, value: boolean) {
  if (!id) return;
  await update({ id, isPriority: value });
}

function closeDialog(id: Id<"debts">) {
  editDialogs.value.find((element) => element?.id === id)?.close();
}

function openDialog(id: Id<"debts">) {
  editDialogs.value.find((element) => element?.id === id)?.showModal();
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onEditSaved(id: Id<"debts">) {
  if (!id) return;
  closeDialog(id);
}

// biome-ignore lint/correctness/noUnusedVariables: used by template click handler
function onDelete(id: Id<"debts">) {
  remove({ id });
}
</script>

<template>
  <section aria-labelledby="debt-order-heading">
    <canvas ref="transparentDragImage" aria-hidden="true" width="1" height="1"></canvas>
    <div class="l-cluster l-split">
      <div>
        <h2 id="debt-order-heading">Debt payoff order</h2>
        <p id="debt-reorder-instructions">
          Drag a grip, or focus it and use the up and down arrow keys.
        </p>
      </div>
      <p aria-live="polite" role="status">
        <span v-if="isSavingOrder" aria-hidden="true"></span>
        {{ orderStatus }}
      </p>
    </div>

    <div v-if="reorderError" role="alert">
      <span>{{ reorderError }}</span>
    </div>

    <div class="u-scroll">
      <table>
        <caption class="u-visually-hidden">
          Debts in payoff order with snowball, payment, edit, and delete controls.
        </caption>
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th v-for="header in headerGroup.headers" :key="header.id">
              <FlexRender v-if="!header.isPlaceholder" :header="header" />
            </th>
          </tr>
        </thead>
        <tbody v-if="localDebts.length === 0">
          <tr>
            <td colspan="5">Add a debt to start building your payoff order.</td>
          </tr>
        </tbody>
        <VueDraggable
          v-else
          v-model="localDebts"
          tag="tbody"
          handle=".drag-handle"
          :animation="dragAnimation"
          :disabled="isSavingOrder"
          :set-data="suppressNativeDragPreview"
          @start="onDragStart"
          @end="onDragEnd"
        >
          <tr v-for="row in table.getRowModel().rows" :key="row.id">
            <td v-for="cell in row.getAllCells()" :key="cell.id">
              <template v-if="cell.column.id === 'drag'">
                <button
                  class="drag-handle"
                  type="button"
                  :aria-disabled="isSavingOrder"
                  :aria-label="getReorderLabel(row.original)"
                  aria-describedby="debt-reorder-instructions"
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  :title="`Move ${row.original.creditor}`"
                  @keydown.up.prevent="moveDebt(row.original._id, -1)"
                  @keydown.down.prevent="moveDebt(row.original._id, 1)"
                >
                  Move
                </button>
              </template>
              <template v-else-if="cell.column.id === 'isPriority'">
                <button
                  type="button"
                  @click="onPriorityToggle(row.original._id, !row.original.isPriority)"
                  :aria-label="`${row.original.isPriority ? 'Remove' : 'Add'} ${row.original.creditor} ${row.original.isPriority ? 'from' : 'to'} the snowball`"
                >
                  {{ row.original.isPriority ? "In snowball" : "Not in snowball" }}
                </button>
              </template>
              <template v-else-if="cell.column.id === 'actions'">
                <div class="actions">
                  <button
                    type="button"
                    :aria-label="`Edit ${row.original.creditor}`"
                    @click="openDialog(row.original._id)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    :aria-label="`Delete ${row.original.creditor}`"
                    @click="onDelete(row.original._id)"
                  >
                    Delete
                  </button>
                </div>
                <dialog :id="row.id" ref="editDialogs">
                  <header class="l-cluster l-split">
                    <h2>Edit {{ row.original.creditor }}</h2>
                    <form method="dialog"><button type="submit">Close</button></form>
                  </header>
                  <lazy-debts-edit :debt="row.original" @updated="onEditSaved" />
                </dialog>
              </template>
              <FlexRender v-else :cell="cell" />
            </td>
          </tr>
        </VueDraggable>
      </table>
    </div>
  </section>
</template>
