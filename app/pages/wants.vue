<script setup lang="ts">
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import type { WantStatus } from "../utils/want-status";

type WantItem = Doc<"wantItems">;
type WantPriority = WantItem["priority"];

type WantFormModel = {
  name: string;
  estimatedCost: string;
  priority: WantPriority | "";
  targetDate: string;
  notes: string;
};

type WantSubmitValues = {
  name: string;
  estimatedCostCents: bigint;
  priority: WantPriority;
  targetDate: number | undefined;
  notes: string;
};

type PurchasePreview = FunctionReturnType<typeof api.wants.previewPurchase> & {
  actualAmountCents: bigint;
};
type PurchaseDialogMode = "purchase" | "correct";

const {
  sections,
  history,
  summary,
  isLoading,
  createItem,
  updateItem,
  changeStatus,
  reorder,
  previewPurchase,
  purchase,
  correctPurchase,
  undoPurchase,
} = useWantList();

const { formatDateInput, localDate } = useDate();

const isFormOpen = ref(false);
const isSavingForm = ref(false);
const isReordering = ref(false);
const editingItem = ref<WantItem | null>(null);
const formError = ref("");
const reorderError = ref("");
const pageError = ref("");
const pageNotice = ref("");
const boughtError = ref("");
const purchaseItem = ref<WantItem | null>(null);
const purchaseMode = ref<PurchaseDialogMode>("purchase");
const purchasePreview = ref<PurchasePreview | null>(null);
const isPreviewPending = ref(false);
const isSubmittingPurchase = ref(false);
const purchaseError = ref("");
const undoPendingItemId = ref<Id<"wantItems"> | undefined>();
const purchaseTrigger = shallowRef<HTMLElement | null>(null);
const formDialog = shallowRef<HTMLDialogElement | null>(null);
let latestPreviewRequest = 0;

function emptyFormModel(): WantFormModel {
  return {
    name: "",
    estimatedCost: "",
    priority: "",
    targetDate: "",
    notes: "",
  };
}

const formModel = ref<WantFormModel>(emptyFormModel());

const hasItems = computed(() => {
  return (
    sections.value.active.length > 0 ||
    sections.value.considering.length > 0 ||
    sections.value.notNow.length > 0 ||
    sections.value.bought.length > 0
  );
});

const inactiveSections = [
  { key: "considering", title: "Considering" },
  { key: "notNow", title: "Not now" },
  { key: "bought", title: "Bought history" },
] as const;

function hasSectionStatus(key: (typeof inactiveSections)[number]["key"]) {
  const section = history[key];
  return (
    section.isInitialLoading.value ||
    section.isLoadingMore.value ||
    section.canLoadMore.value ||
    Boolean(section.error.value)
  );
}

const hasPendingSections = computed(() =>
  inactiveSections.some(({ key }) => hasSectionStatus(key)),
);

const activeAllocations = computed(() => {
  return summary.value?.activeAllocations ?? [];
});

const formTitle = computed(() => {
  return editingItem.value ? `Edit ${editingItem.value.name}` : "Add Want";
});

function centsToInput(cents: bigint): string {
  const wholeDollars = cents / 100n;
  const fractionalCents = (cents % 100n).toString().padStart(2, "0");

  return `${wholeDollars}.${fractionalCents}`;
}

function clearFeedback() {
  formError.value = "";
  pageError.value = "";
  pageNotice.value = "";
}

function openPurchase(item: WantItem, mode: PurchaseDialogMode = "purchase") {
  if (import.meta.client && document.activeElement instanceof HTMLElement) {
    purchaseTrigger.value = document.activeElement;
  }

  pageError.value = "";
  pageNotice.value = "";
  purchaseError.value = "";
  purchasePreview.value = null;
  purchaseMode.value = mode;
  purchaseItem.value = item;
}

function closePurchaseDialog(force = false) {
  if (isSubmittingPurchase.value && !force) return;

  latestPreviewRequest += 1;
  isPreviewPending.value = false;
  purchasePreview.value = null;
  purchaseError.value = "";
  purchaseItem.value = null;

  void nextTick(() => {
    purchaseTrigger.value?.focus();
    purchaseTrigger.value = null;
  });
}

async function requestPurchasePreview(value: {
  itemId: Id<"wantItems">;
  actualAmountCents: bigint;
}) {
  if (
    purchaseMode.value !== "purchase" ||
    !purchaseItem.value ||
    purchaseItem.value._id !== value.itemId
  ) {
    return;
  }

  const requestId = ++latestPreviewRequest;
  isPreviewPending.value = true;
  purchaseError.value = "";

  try {
    const result = await previewPurchase(value);

    if (requestId !== latestPreviewRequest) return;

    if (!result.success) {
      purchaseError.value = result.error;
      return;
    }

    purchasePreview.value = {
      actualAmountCents: value.actualAmountCents,
      ...result.data,
    };
  } finally {
    if (requestId === latestPreviewRequest) {
      isPreviewPending.value = false;
    }
  }
}

async function submitPurchase(
  value:
    | {
        itemId: Id<"wantItems">;
        actualAmountCents: bigint;
        purchaseLocalDate: string;
      }
    | {
        itemId: Id<"wantItems">;
        actualAmountCents: bigint;
      },
) {
  if (!purchaseItem.value || isSubmittingPurchase.value) return;

  isSubmittingPurchase.value = true;
  purchaseError.value = "";

  try {
    if (purchaseMode.value === "correct") {
      const result = await correctPurchase({
        itemId: value.itemId,
        actualAmountCents: value.actualAmountCents,
      });

      if (!result.success) {
        purchaseError.value = result.error;
        return;
      }

      pageNotice.value = "Purchase correction saved.";
      closePurchaseDialog(true);
      return;
    }

    if (!("purchaseLocalDate" in value)) return;

    const result = await purchase(value);

    if (!result.success) {
      purchaseError.value = result.error;
      return;
    }

    pageNotice.value = `${formatCents(value.actualAmountCents)} total · ${formatCents(result.data.savingsUsedCents)} from savings · ${formatCents(result.data.budgetImpactCents)} budget impact.`;
    closePurchaseDialog(true);
  } finally {
    isSubmittingPurchase.value = false;
  }
}

async function undoPurchaseFromHistory(itemId: Id<"wantItems">) {
  if (undoPendingItemId.value) return;

  undoPendingItemId.value = itemId;
  boughtError.value = "";
  pageNotice.value = "";

  try {
    const result = await undoPurchase({ itemId });

    if (!result.success) {
      boughtError.value = result.error;
      return;
    }

    pageNotice.value = "Purchase undone. The Want is back at the bottom of Plan for it.";
  } finally {
    undoPendingItemId.value = undefined;
  }
}

function openCreateForm() {
  clearFeedback();
  editingItem.value = null;
  formModel.value = emptyFormModel();
  isFormOpen.value = true;
}

function openEditForm(item: WantItem) {
  clearFeedback();
  editingItem.value = item;
  formModel.value = {
    name: item.name,
    estimatedCost: centsToInput(item.estimatedCostCents),
    priority: item.priority,
    targetDate: item.targetDate === undefined ? "" : formatDateInput(new Date(item.targetDate)),
    notes: item.notes,
  };
  isFormOpen.value = true;
}

function closeForm() {
  if (isSavingForm.value) return;

  isFormOpen.value = false;
  editingItem.value = null;
  formError.value = "";
}

watch(isFormOpen, async (open) => {
  await nextTick();

  if (open && !formDialog.value?.open) {
    formDialog.value?.showModal();
  } else if (!open && formDialog.value?.open) {
    formDialog.value.close();
  }
});

function onFormDialogClose() {
  if (isFormOpen.value) closeForm();
}

function onFormDialogCancel(event: Event) {
  if (isSavingForm.value) event.preventDefault();
}

async function saveWant(values: WantSubmitValues) {
  if (isSavingForm.value) return;

  isSavingForm.value = true;
  formError.value = "";

  try {
    if (editingItem.value) {
      const result = await updateItem({
        itemId: editingItem.value._id,
        name: values.name,
        estimatedCostCents: values.estimatedCostCents,
        priority: values.priority,
        targetDate: values.targetDate ?? null,
        notes: values.notes,
      });

      if (!result.success) {
        formError.value = result.error;
        return;
      }

      pageNotice.value = `${values.name.trim()} updated.`;
    } else {
      const result = await createItem({
        name: values.name,
        estimatedCostCents: values.estimatedCostCents,
        priority: values.priority,
        notes: values.notes,
        ...(values.targetDate === undefined ? {} : { targetDate: values.targetDate }),
      });

      if (!result.success) {
        formError.value = result.error;
        return;
      }

      pageNotice.value = `${values.name.trim()} added to Considering.`;
    }

    isFormOpen.value = false;
    editingItem.value = null;
    formModel.value = emptyFormModel();
  } finally {
    isSavingForm.value = false;
  }
}

async function updateStatus(value: { itemId: Id<"wantItems">; status: WantStatus }) {
  pageError.value = "";
  pageNotice.value = "";

  const result = await changeStatus(value);

  if (!result.success) {
    pageError.value = result.error;
    return;
  }

  pageNotice.value =
    result.data.kind === "money_migration_pending"
      ? "Preparing household money data. Try planning this Want again shortly."
      : "Want status updated.";
}

async function saveOrder(order: FunctionArgs<typeof api.wants.reorder>) {
  if (isReordering.value) return;

  isReordering.value = true;
  reorderError.value = "";
  pageNotice.value = "";

  try {
    const result = await reorder(order);

    if (!result.success) {
      reorderError.value = result.error;
      return;
    }

    if (!result.data.success) {
      reorderError.value =
        "The queue changed while you were reordering. Review the latest order and try again.";
      return;
    }

    pageNotice.value = "Want order saved.";
  } finally {
    isReordering.value = false;
  }
}
</script>

<template>
  <main class="l-page l-stack" :aria-busy="isLoading ? 'true' : undefined">
    <header class="l-cluster l-split">
      <div>
        <h1>Wants</h1>
        <p>Decide together, order what matters, and track the shared savings funding each goal.</p>
      </div>

      <button type="button" aria-label="Add Want" @click="openCreateForm">Add Want</button>
    </header>

    <div v-if="isLoading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <p>Loading Wants…</p>
    </div>

    <template v-else>
      <WantsSavingsSummary
        v-if="summary"
        :summary="summary"
        :next-item-name="sections.active[0]?.name"
      />

      <p v-if="pageError" role="alert" aria-live="polite">
        {{ pageError }}
      </p>

      <p v-if="pageNotice" role="status" aria-live="polite">
        {{ pageNotice }}
      </p>

      <section
        v-if="!hasItems && !hasPendingSections"
        class="panel"
        aria-labelledby="empty-wants-heading"
      >
        <h2 id="empty-wants-heading">No Wants yet</h2>
        <p>
          Add an idea to Considering, then move it into the active plan when the household is ready.
        </p>
      </section>

      <div v-else class="l-stack">
        <WantsList
          v-if="sections.active.length"
          title="Plan for it"
          :items="sections.active"
          :allocations="activeAllocations"
          reorderable
          :reorder-pending="isReordering"
          :reorder-error="reorderError"
          @reorder="saveOrder"
          @edit="openEditForm"
          @purchase="openPurchase"
          @change-status="updateStatus"
        />

        <template v-for="{ key, title } in inactiveSections" :key="key">
          <div v-if="sections[key].length || hasSectionStatus(key)" class="l-stack">
            <WantsBoughtList
              v-if="key === 'bought' && sections[key].length"
              :items="sections[key]"
              :pending-item-id="undoPendingItemId"
              :error="boughtError"
              @correct="openPurchase($event, 'correct')"
              @undo="undoPurchaseFromHistory"
            />
            <WantsList
              v-else-if="sections[key].length"
              :title="title"
              :items="sections[key]"
              @edit="openEditForm"
              @change-status="updateStatus"
            />
            <div v-if="history[key].error.value">
              <p role="alert">Could not load {{ title }}.</p>
              <button type="button" @click="history[key].retry()">Retry {{ title }}</button>
            </div>
            <p v-else-if="history[key].isInitialLoading.value" role="status">
              Loading {{ title }}…
            </p>
            <button
              v-else-if="history[key].canLoadMore.value || history[key].isLoadingMore.value"
              type="button"
              :disabled="history[key].isLoadingMore.value"
              @click="history[key].loadMore()"
            >
              {{
                history[key].isLoadingMore.value ? `Loading ${title}…` : `Load more from ${title}`
              }}
            </button>
          </div>
        </template>
      </div>
    </template>

    <dialog
      ref="formDialog"
      aria-labelledby="want-form-title"
      @close="onFormDialogClose"
      @cancel="onFormDialogCancel"
    >
      <header class="l-cluster l-split">
        <h2 id="want-form-title">{{ formTitle }}</h2>
        <button type="button" :disabled="isSavingForm" @click="closeForm">Close</button>
      </header>

      <WantsForm
        v-model="formModel"
        :submit-label="editingItem ? 'Save changes' : 'Add Want'"
        :is-submitting="isSavingForm"
        :error="formError"
        @submit="saveWant"
      />
    </dialog>

    <WantsPurchaseDialog
      v-if="purchaseItem"
      :open="Boolean(purchaseItem)"
      :item="purchaseItem"
      :mode="purchaseMode"
      :purchase-local-date="localDate"
      :preview="purchasePreview"
      :preview-pending="isPreviewPending"
      :is-submitting="isSubmittingPurchase"
      :error="purchaseError"
      @request-preview="requestPurchasePreview"
      @submit="submitPurchase"
      @close="closePurchaseDialog"
    />
  </main>
</template>
