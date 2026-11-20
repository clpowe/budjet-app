<script setup lang="ts">
import type { FunctionArgs } from "convex/server";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { api } from "@generated/api";
import type { Doc, Id } from "@generated/dataModel";
import { projectAllocations } from "../utils/goal-allocations";
import type { GoalStatus } from "../utils/goal-status";

type Goal = Doc<"goals">;
type GoalPriority = Goal["priority"];

type GoalFormModel = {
  name: string;
  estimatedCost: string;
  priority: GoalPriority | "";
  targetDate: string;
  notes: string;
};

type GoalSubmitValues = {
  name: string;
  estimatedCostCents: bigint;
  priority: GoalPriority;
  targetDate: number | undefined;
  notes: string;
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
  purchase,
  correctPurchase,
  undoPurchase,
} = useGoalList();

const { formatDateInput, localDate } = useDate();

const isFormOpen = ref(false);
const isSavingForm = ref(false);
const isReordering = ref(false);
const editingItem = ref<Goal | null>(null);
const formError = ref("");
const reorderError = ref("");
const pageError = ref("");
const pageNotice = ref("");
const boughtError = ref("");
const purchaseItem = ref<Goal | null>(null);
const purchaseMode = ref<PurchaseDialogMode>("purchase");
const isSubmittingPurchase = ref(false);
const purchaseError = ref("");
const undoPendingItemId = ref<Id<"goals"> | undefined>();
const purchaseTrigger = shallowRef<HTMLElement | null>(null);
const formDialog = shallowRef<HTMLDialogElement | null>(null);

function emptyFormModel(): GoalFormModel {
  return {
    name: "",
    estimatedCost: "",
    priority: "",
    targetDate: "",
    notes: "",
  };
}

const formModel = ref<GoalFormModel>(emptyFormModel());

const hasItems = computed(() => {
  return (
    sections.value.active.length > 0 ||
    sections.value.ideas.length > 0 ||
    sections.value.onHold.length > 0 ||
    sections.value.purchased.length > 0
  );
});

const inactiveSections = [
  { key: "ideas", title: "Considering" },
  { key: "onHold", title: "Not now" },
  { key: "purchased", title: "Bought history" },
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
  return projectAllocations(summary.value?.availableSavingsCents ?? 0n, sections.value.active);
});

const formTitle = computed(() => {
  return editingItem.value ? `Edit ${editingItem.value.name}` : "Add goal";
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

function openPurchase(item: Goal, mode: PurchaseDialogMode = "purchase") {
  if (import.meta.client && document.activeElement instanceof HTMLElement) {
    purchaseTrigger.value = document.activeElement;
  }

  pageError.value = "";
  pageNotice.value = "";
  purchaseError.value = "";
  purchaseMode.value = mode;
  purchaseItem.value = item;
}

function closePurchaseDialog(force = false) {
  if (isSubmittingPurchase.value && !force) return;

  purchaseError.value = "";
  purchaseItem.value = null;

  void nextTick(() => {
    purchaseTrigger.value?.focus();
    purchaseTrigger.value = null;
  });
}

async function submitPurchase(
  value:
    | {
        goalId: Id<"goals">;
        actualAmountCents: bigint;
        purchaseLocalDate: string;
      }
    | {
        goalId: Id<"goals">;
        actualAmountCents: bigint;
      },
) {
  if (!purchaseItem.value || isSubmittingPurchase.value) return;

  isSubmittingPurchase.value = true;
  purchaseError.value = "";

  try {
    if (purchaseMode.value === "correct") {
      const result = await correctPurchase({
        goalId: value.goalId,
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

    pageNotice.value = `${formatCents(value.actualAmountCents)} total · ${formatCents(result.data.fromSavingsCents)} from savings · ${formatCents(result.data.budgetImpactCents)} budget impact.`;
    closePurchaseDialog(true);
  } finally {
    isSubmittingPurchase.value = false;
  }
}

async function undoPurchaseFromHistory(goalId: Id<"goals">) {
  if (undoPendingItemId.value) return;

  undoPendingItemId.value = goalId;
  boughtError.value = "";
  pageNotice.value = "";

  try {
    const result = await undoPurchase({ goalId });

    if (!result.success) {
      boughtError.value = result.error;
      return;
    }

    pageNotice.value = "Purchase undone. The goal is back at the bottom of Plan for it.";
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

function openEditForm(item: Goal) {
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

async function saveGoal(values: GoalSubmitValues) {
  if (isSavingForm.value) return;

  isSavingForm.value = true;
  formError.value = "";

  try {
    if (editingItem.value) {
      const result = await updateItem({
        goalId: editingItem.value._id,
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

async function updateStatus(value: { goalId: Id<"goals">; status: GoalStatus }) {
  pageError.value = "";
  pageNotice.value = "";

  const result = await changeStatus(value);

  if (!result.success) {
    pageError.value = result.error;
    return;
  }

  pageNotice.value = "Goal status updated.";
}

async function saveOrder(order: FunctionArgs<typeof api.goals.reorder>) {
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

    pageNotice.value = "Goal order saved.";
  } finally {
    isReordering.value = false;
  }
}
</script>

<template>
  <main class="l-page l-stack" :aria-busy="isLoading ? 'true' : undefined">
    <header class="l-cluster l-split">
      <div>
        <h1>Goals</h1>
        <p>Decide together, order what matters, and track the shared savings funding each goal.</p>
      </div>

      <button type="button" aria-label="Add goal" @click="openCreateForm">Add goal</button>
    </header>

    <div v-if="isLoading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <p>Loading goals…</p>
    </div>

    <template v-else>
      <GoalsSavingsSummary
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
        aria-labelledby="empty-goals-heading"
      >
        <h2 id="empty-goals-heading">No goals yet</h2>
        <p>
          Add an idea to Considering, then move it into the active plan when the household is ready.
        </p>
      </section>

      <div v-else class="l-stack">
        <GoalsList
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
            <GoalsPurchaseHistory
              v-if="key === 'purchased' && sections[key].length"
              :items="sections[key]"
              :pending-item-id="undoPendingItemId"
              :error="boughtError"
              @correct="openPurchase($event, 'correct')"
              @undo="undoPurchaseFromHistory"
            />
            <GoalsList
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
      aria-labelledby="goal-form-title"
      @close="onFormDialogClose"
      @cancel="onFormDialogCancel"
    >
      <header class="l-cluster l-split">
        <h2 id="goal-form-title">{{ formTitle }}</h2>
        <button type="button" :disabled="isSavingForm" @click="closeForm">Close</button>
      </header>

      <GoalsForm
        v-model="formModel"
        :submit-label="editingItem ? 'Save changes' : 'Add goal'"
        :is-submitting="isSavingForm"
        :error="formError"
        @submit="saveGoal"
      />
    </dialog>

    <GoalsPurchaseDialog
      v-if="purchaseItem"
      :open="Boolean(purchaseItem)"
      :item="purchaseItem"
      :mode="purchaseMode"
      :purchase-local-date="localDate"
      :is-submitting="isSubmittingPurchase"
      :error="purchaseError"
      :active-goals="sections.active"
      :available-savings-cents="summary?.availableSavingsCents ?? 0n"
      @submit="submitPurchase"
      @close="closePurchaseDialog"
    />
  </main>
</template>
