<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import type { Doc, Id } from "@generated/dataModel";

type WantItem = Doc<"wantItems">;

type PurchasePreview = {
  actualAmountCents: bigint;
  reserveUsedCents: bigint;
  budgetImpactCents: bigint;
  lowerItemImpacts: Array<{
    itemId: Id<"wantItems">;
    name: string;
    lostCents: bigint;
    allocatedCentsAfter: bigint;
  }>;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    item: WantItem;
    mode?: "purchase" | "correct";
    purchaseLocalDate: string;
    preview?: PurchasePreview | null;
    previewPending?: boolean;
    isSubmitting?: boolean;
    error?: string;
  }>(),
  {
    mode: "purchase",
    preview: null,
    previewPending: false,
    isSubmitting: false,
    error: "",
  },
);

const emit = defineEmits<{
  (
    event: "request-preview",
    value: {
      itemId: Id<"wantItems">;
      actualAmountCents: bigint;
    },
  ): void;
  (
    event: "submit",
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
  ): void;
  (event: "close"): void;
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const amountInput = ref<HTMLInputElement | null>(null);
const actualAmount = ref("");
const purchaseDate = ref(props.purchaseLocalDate);
const errorId = useId();

function centsToInput(cents: bigint): string {
  const wholeDollars = cents / 100n;
  const fractionalCents = (cents % 100n).toString().padStart(2, "0");

  return `${wholeDollars}.${fractionalCents}`;
}

const parsedAmount = computed(() => {
  try {
    const cents = parseMoneyToCents(actualAmount.value);

    return cents > 0n ? cents : null;
  } catch {
    return null;
  }
});

const amountError = computed(() => {
  if (!actualAmount.value) {
    return "Enter the full actual amount.";
  }

  try {
    return parseMoneyToCents(actualAmount.value) > 0n
      ? ""
      : "Actual amount must be greater than $0.00.";
  } catch {
    return "Enter a valid amount with no more than two decimal places.";
  }
});

const matchingPreview = computed(() => {
  if (
    !props.preview ||
    parsedAmount.value === null ||
    props.preview.actualAmountCents !== parsedAmount.value
  ) {
    return null;
  }

  return props.preview;
});

const title = computed(() => {
  return props.mode === "correct"
    ? `Correct ${props.item.name} purchase`
    : `Purchase ${props.item.name}`;
});

const submitLabel = computed(() => {
  if (props.isSubmitting) {
    return props.mode === "correct" ? "Saving correction…" : "Completing purchase…";
  }

  return props.mode === "correct" ? "Save correction" : "Complete purchase";
});

function resetForm() {
  actualAmount.value = centsToInput(
    props.preview?.actualAmountCents ?? props.item.estimatedCostCents,
  );
  purchaseDate.value = props.purchaseLocalDate;
}

function requestPreview() {
  if (props.mode !== "purchase" || parsedAmount.value === null) {
    return;
  }

  emit("request-preview", {
    itemId: props.item._id,
    actualAmountCents: parsedAmount.value,
  });
}

function onAmountInput(event: Event) {
  actualAmount.value = (event.target as HTMLInputElement).value;

  requestPreview();
}

async function syncDialog(open: boolean) {
  await nextTick();

  const element = dialog.value;

  if (!element) return;

  if (open) {
    if (!element.open) {
      if (typeof element.showModal === "function") {
        element.showModal();
      } else {
        element.setAttribute("open", "");
      }
    }

    amountInput.value?.focus();
    return;
  }

  if (element.open) {
    if (typeof element.close === "function") {
      element.close();
    } else {
      element.removeAttribute("open");
    }
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
      requestPreview();
    }

    void syncDialog(open);
  },
  { immediate: true },
);

watch(
  () => props.item._id,
  () => {
    if (!props.open) return;

    resetForm();
    requestPreview();
  },
);

function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !dialog.value) return;

  const focusable = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first && last) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last && first) {
    event.preventDefault();
    first.focus();
  }
}

function submit() {
  if (parsedAmount.value === null || props.previewPending || props.isSubmitting) {
    return;
  }

  if (props.mode === "correct") {
    emit("submit", {
      itemId: props.item._id,
      actualAmountCents: parsedAmount.value,
    });
    return;
  }

  if (!purchaseDate.value) return;

  emit("submit", {
    itemId: props.item._id,
    actualAmountCents: parsedAmount.value,
    purchaseLocalDate: purchaseDate.value,
  });
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-modal="true"
    :aria-labelledby="`${errorId}-title`"
    @cancel.prevent="emit('close')"
    @keydown="trapFocus"
  >
    <div class="modal-box max-w-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 :id="`${errorId}-title`" class="text-xl font-bold">
            {{ title }}
          </h2>
          <p class="mt-1 text-sm text-base-content/65">
            Enter the full amount paid. The server recalculates funding when you confirm.
          </p>
        </div>

        <button
          type="button"
          class="btn btn-ghost btn-circle btn-sm"
          aria-label="Close purchase dialog"
          :disabled="isSubmitting"
          @click="emit('close')"
        >
          <Icon name="lucide:x" size="18" aria-hidden="true" />
        </button>
      </div>

      <form class="mt-5 space-y-5" novalidate @submit.prevent="submit">
        <label class="flex flex-col gap-1">
          <span class="label">Full actual amount</span>
          <input
            ref="amountInput"
            name="actualAmount"
            type="text"
            inputmode="decimal"
            class="input w-full"
            :value="actualAmount"
            :disabled="isSubmitting"
            :aria-invalid="Boolean(amountError)"
            @input="onAmountInput"
          />
        </label>

        <p v-if="amountError" role="alert" class="text-sm text-error">
          {{ amountError }}
        </p>

        <label v-if="mode === 'purchase'" class="flex flex-col gap-1">
          <span class="label">Purchase date</span>
          <input
            v-model="purchaseDate"
            name="purchaseLocalDate"
            type="date"
            class="input w-full"
            :disabled="isSubmitting"
            required
          />
        </label>

        <p
          v-if="previewPending"
          role="status"
          aria-live="polite"
          class="text-sm text-base-content/65"
        >
          Refreshing purchase breakdown…
        </p>

        <dl
          v-if="mode === 'purchase' && matchingPreview"
          data-test="purchase-breakdown"
          class="grid gap-3 rounded-xl bg-base-200 p-4 sm:grid-cols-3"
        >
          <div>
            <dt class="text-xs text-base-content/60">Actual amount</dt>
            <dd class="font-bold">
              {{ formatCents(matchingPreview.actualAmountCents) }}
            </dd>
          </div>

          <div>
            <dt class="text-xs text-base-content/60">Reserve used</dt>
            <dd class="font-bold">
              {{ formatCents(matchingPreview.reserveUsedCents) }}
            </dd>
          </div>

          <div>
            <dt class="text-xs text-base-content/60">General-budget impact</dt>
            <dd class="font-bold">
              {{ formatCents(matchingPreview.budgetImpactCents) }}
            </dd>
          </div>
        </dl>

        <section
          v-if="matchingPreview && matchingPreview.lowerItemImpacts.length > 0"
          data-test="lower-item-impacts"
          class="rounded-xl border border-warning/40 bg-warning/10 p-4"
          aria-labelledby="lower-item-impact-heading"
        >
          <h3 id="lower-item-impact-heading" class="font-bold">Progress used from later Wants</h3>

          <ul class="mt-2 space-y-2">
            <li
              v-for="impact in matchingPreview.lowerItemImpacts"
              :key="impact.itemId"
              class="text-sm"
            >
              <strong>{{ impact.name }}</strong>
              <span class="block">
                {{ formatCents(impact.lostCents) }} progress used ·
                {{ formatCents(impact.allocatedCentsAfter) }} remains allocated
              </span>
            </li>
          </ul>
        </section>

        <p v-if="error" role="alert" aria-live="polite" class="alert alert-error text-sm">
          {{ error }}
        </p>

        <div class="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-primary"
            :disabled="
              Boolean(amountError) ||
              previewPending ||
              isSubmitting ||
              (mode === 'purchase' && !purchaseDate)
            "
            :aria-busy="isSubmitting ? 'true' : undefined"
          >
            {{ submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </dialog>
</template>
