<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import type { Doc, Id } from "@generated/dataModel";

type WantItem = Doc<"goals">;

type PurchasePreview = {
  actualAmountCents: bigint;
  fromSavingsCents: bigint;
  budgetImpactCents: bigint;
  progressLosses: Array<{
    goalId: Id<"goals">;
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
      goalId: Id<"goals">;
      actualAmountCents: bigint;
    },
  ): void;
  (
    event: "submit",
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
    goalId: props.item._id,
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

function submit() {
  if (parsedAmount.value === null || props.previewPending || props.isSubmitting) {
    return;
  }

  if (props.mode === "correct") {
    emit("submit", {
      goalId: props.item._id,
      actualAmountCents: parsedAmount.value,
    });
    return;
  }

  if (!purchaseDate.value) return;

  emit("submit", {
    goalId: props.item._id,
    actualAmountCents: parsedAmount.value,
    purchaseLocalDate: purchaseDate.value,
  });
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-modal="true"
    :aria-labelledby="`${errorId}-title`"
    @cancel.prevent="emit('close')"
  >
    <div class="l-stack">
      <header class="l-cluster l-split">
        <div>
          <h2 :id="`${errorId}-title`">
            {{ title }}
          </h2>
          <p>Enter the full amount paid. The server recalculates funding when you confirm.</p>
        </div>

        <button type="button" :disabled="isSubmitting" @click="emit('close')">Close</button>
      </header>

      <form class="app-form" novalidate @submit.prevent="submit">
        <label>
          <span>Full actual amount</span>
          <input
            ref="amountInput"
            name="actualAmount"
            type="text"
            inputmode="decimal"
            :value="actualAmount"
            :disabled="isSubmitting"
            :aria-invalid="Boolean(amountError)"
            @input="onAmountInput"
          />
        </label>

        <p v-if="amountError" role="alert">
          {{ amountError }}
        </p>

        <label v-if="mode === 'purchase'">
          <span>Purchase date</span>
          <input
            v-model="purchaseDate"
            name="purchaseLocalDate"
            type="date"
            :disabled="isSubmitting"
            required
          />
        </label>

        <p v-if="previewPending" role="status" aria-live="polite">Refreshing purchase breakdown…</p>

        <dl
          class="l-grid"
          v-if="mode === 'purchase' && matchingPreview"
          data-test="purchase-breakdown"
        >
          <div>
            <dt>Actual amount</dt>
            <dd>
              {{ formatCents(matchingPreview.actualAmountCents) }}
            </dd>
          </div>

          <div>
            <dt>Paid from savings</dt>
            <dd>
              {{ formatCents(matchingPreview.fromSavingsCents) }}
            </dd>
          </div>

          <div>
            <dt>General-budget impact</dt>
            <dd>
              {{ formatCents(matchingPreview.budgetImpactCents) }}
            </dd>
          </div>
        </dl>

        <section
          v-if="matchingPreview && matchingPreview.progressLosses.length > 0"
          data-test="progress-losses"
          aria-labelledby="progress-losses-heading"
        >
          <h3 id="progress-losses-heading">Progress affected on other Wants</h3>

          <ul>
            <li v-for="loss in matchingPreview.progressLosses" :key="loss.goalId">
              <strong>{{ loss.name }}</strong>
              <span>
                {{ formatCents(loss.lostCents) }} progress used ·
                {{ formatCents(loss.allocatedCentsAfter) }} remains allocated
              </span>
            </li>
          </ul>
        </section>

        <p v-if="error" role="alert" aria-live="polite">
          {{ error }}
        </p>

        <div class="actions">
          <button type="button" :disabled="isSubmitting" @click="emit('close')">Cancel</button>

          <button
            type="submit"
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
