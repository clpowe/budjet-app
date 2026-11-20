<script setup lang="ts">
import { nextTick, ref } from "vue";
import type { Doc, Id } from "@generated/dataModel";
import GoalsStatusBadge from "./status-badge.vue";

type Goal = Doc<"goals">;

withDefaults(
  defineProps<{
    items: Goal[];
    pendingItemId?: Id<"goals">;
    error?: string;
  }>(),
  {
    pendingItemId: undefined,
    error: "",
  },
);

const emit = defineEmits<{
  (event: "correct", item: Goal): void;
  (event: "undo", goalId: Id<"goals">): void;
}>();

const confirmingItemId = ref<Id<"goals"> | null>(null);

function purchaseDateLabel(timestamp?: number): string {
  if (timestamp === undefined) return "Purchase date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function confirmUndo(goalId: Id<"goals">) {
  emit("undo", goalId);
  (document.getElementById(`undo-${goalId}`) as HTMLDialogElement | null)?.close();
  confirmingItemId.value = null;
}

async function openUndoDialog(goalId: Id<"goals">) {
  confirmingItemId.value = goalId;
  await nextTick();
  (document.getElementById(`undo-${goalId}`) as HTMLDialogElement | null)?.showModal();
}
</script>

<template>
  <section class="l-stack" aria-labelledby="purchase-history-heading">
    <div>
      <h2 id="purchase-history-heading">Purchase history</h2>
      <p>Completed goals remain linked to their ledger entries.</p>
    </div>

    <p v-if="error" role="alert" aria-live="polite">
      {{ error }}
    </p>

    <article v-for="item in items" :key="item._id" class="panel l-stack">
      <div class="actions">
        <div>
          <h3>{{ item.name }}</h3>
          <p>Purchased {{ purchaseDateLabel(item.purchasedAt) }}</p>
        </div>

        <GoalsStatusBadge status="purchased" />
      </div>

      <p>Estimated cost: {{ formatCents(item.estimatedCostCents) }}</p>

      <NuxtLink v-if="item.expenseId" :to="`/monthly?expense=${item.expenseId}`">
        View linked ledger entry
      </NuxtLink>

      <div>
        <button
          type="button"
          :aria-label="`Correct ${item.name} purchase`"
          :disabled="pendingItemId === item._id"
          @click="emit('correct', item)"
        >
          Correct purchase
        </button>

        <button
          type="button"
          :aria-label="`Undo ${item.name} purchase`"
          :disabled="pendingItemId === item._id"
          @click="openUndoDialog(item._id)"
        >
          Undo purchase
        </button>
      </div>

      <dialog
        v-if="confirmingItemId === item._id"
        :id="`undo-${item._id}`"
        role="alertdialog"
        :aria-labelledby="`undo-${item._id}-heading`"
        @close="confirmingItemId = null"
      >
        <h4 :id="`undo-${item._id}-heading`">Undo this purchase?</h4>

        <p>
          This removes the linked expense and restores {{ item.name }} to the bottom of Saving for.
        </p>

        <div class="actions">
          <button
            type="button"
            :aria-label="`Confirm undo ${item.name} purchase`"
            @click="confirmUndo(item._id)"
          >
            Confirm undo
          </button>

          <form method="dialog"><button type="submit">Keep purchase</button></form>
        </div>
      </dialog>
    </article>
  </section>
</template>
