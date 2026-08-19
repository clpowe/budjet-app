<script setup lang="ts">
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

const { sections, summary, isLoading, createItem, updateItem, changeStatus, reorder } =
  useWantList();

const { formatDateInput } = useDate();

const isFormOpen = ref(false);
const isSavingForm = ref(false);
const isReordering = ref(false);
const editingItem = ref<WantItem | null>(null);
const formError = ref("");
const reorderError = ref("");
const pageError = ref("");
const pageNotice = ref("");

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

async function saveOrder(itemIds: Id<"wantItems">[]) {
  if (isReordering.value) return;

  isReordering.value = true;
  reorderError.value = "";
  pageNotice.value = "";

  try {
    const result = await reorder({ itemIds });

    if (!result.success) {
      reorderError.value = result.error.includes("changed while reordering")
        ? "The queue changed. The latest order has been restored."
        : `${result.error} The latest order has been restored.`;
      return;
    }

    pageNotice.value = "Want order saved.";
  } finally {
    isReordering.value = false;
  }
}
</script>

<template>
  <main
    class="container mx-auto space-y-6 px-4 py-5 sm:space-y-8 sm:py-8"
    :aria-busy="isLoading ? 'true' : undefined"
  >
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black">Wants</h1>
        <p class="mt-2 max-w-2xl text-base-content/65">
          Decide together, order what matters, and track the shared reserve funding each goal.
        </p>
      </div>

      <button type="button" class="btn btn-primary" aria-label="Add Want" @click="openCreateForm">
        <Icon name="lucide:plus" size="18" aria-hidden="true" />
        Add Want
      </button>
    </header>

    <div
      v-if="isLoading"
      role="status"
      aria-live="polite"
      class="rounded-xl border border-base-300 bg-base-100 p-8 text-center"
    >
      <span class="loading loading-spinner loading-md" aria-hidden="true" />
      <p class="mt-3 font-semibold">Loading Wants…</p>
    </div>

    <template v-else>
      <WantsReserveSummary v-if="summary" :summary="summary" />

      <p v-if="pageError" role="alert" aria-live="polite" class="alert alert-error">
        {{ pageError }}
      </p>

      <p v-if="pageNotice" role="status" aria-live="polite" class="alert alert-success">
        {{ pageNotice }}
      </p>

      <section
        v-if="!hasItems"
        class="rounded-xl border border-dashed border-base-300 bg-base-100 p-8 text-center"
        aria-labelledby="empty-wants-heading"
      >
        <h2 id="empty-wants-heading" class="text-xl font-bold">No Wants yet</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm text-base-content/65">
          Add an idea to Considering, then move it into the active plan when the household is ready.
        </p>
      </section>

      <div v-else class="space-y-8">
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
          @change-status="updateStatus"
        />

        <WantsList
          v-if="sections.considering.length"
          title="Considering"
          :items="sections.considering"
          @edit="openEditForm"
          @change-status="updateStatus"
        />

        <WantsList
          v-if="sections.notNow.length"
          title="Not now"
          :items="sections.notNow"
          @edit="openEditForm"
          @change-status="updateStatus"
        />

        <WantsList
          v-if="sections.bought.length"
          title="Bought"
          :items="sections.bought"
          @edit="openEditForm"
          @change-status="updateStatus"
        />
      </div>
    </template>

    <div
      v-if="isFormOpen"
      class="fixed inset-0 z-50 grid place-items-center bg-base-content/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="want-form-title"
    >
      <section
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-base-100 p-5 shadow-xl"
      >
        <div class="mb-5 flex items-center justify-between gap-3">
          <h2 id="want-form-title" class="text-xl font-bold">
            {{ formTitle }}
          </h2>

          <button
            type="button"
            class="btn btn-ghost btn-circle btn-sm"
            aria-label="Close Want form"
            :disabled="isSavingForm"
            @click="closeForm"
          >
            <Icon name="lucide:x" size="18" aria-hidden="true" />
          </button>
        </div>

        <WantsForm
          v-model="formModel"
          :submit-label="editingItem ? 'Save changes' : 'Add Want'"
          :is-submitting="isSavingForm"
          :error="formError"
          @submit="saveWant"
        />
      </section>
    </div>
  </main>
</template>
