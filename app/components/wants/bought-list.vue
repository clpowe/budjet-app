<script setup lang="ts">
import { nextTick, ref } from "vue";
import type { Doc, Id } from "@generated/dataModel";
import WantsStatusBadge from "./status-badge.vue";

type WantItem = Doc<"wantItems">;

withDefaults(
  defineProps<{
    items: WantItem[];
    pendingItemId?: Id<"wantItems">;
    error?: string;
  }>(),
  {
    pendingItemId: undefined,
    error: "",
  },
);

const emit = defineEmits<{
  (event: "correct", item: WantItem): void;
  (event: "undo", itemId: Id<"wantItems">): void;
}>();

const confirmingItemId = ref<Id<"wantItems"> | null>(null);

function purchaseDateLabel(timestamp?: number): string {
  if (timestamp === undefined) return "Purchase date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function confirmUndo(itemId: Id<"wantItems">) {
  emit("undo", itemId);
  (document.getElementById(`undo-${itemId}`) as HTMLDialogElement | null)?.close();
  confirmingItemId.value = null;
}

async function openUndoDialog(itemId: Id<"wantItems">) {
  confirmingItemId.value = itemId;
  await nextTick();
  (document.getElementById(`undo-${itemId}`) as HTMLDialogElement | null)?.showModal();
}
</script>

<template>
  <section class="l-stack" aria-labelledby="bought-history-heading">
    <div>
      <h2 id="bought-history-heading">Bought history</h2>
      <p>Completed Wants remain linked to their ledger entries.</p>
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

        <WantsStatusBadge status="bought" />
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
          This removes the linked expense and restores {{ item.name }} to the bottom of Plan for it.
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
