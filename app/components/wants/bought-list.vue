<script setup lang="ts">
import { ref } from "vue";
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
  confirmingItemId.value = null;
}
</script>

<template>
  <section aria-labelledby="bought-history-heading" class="space-y-3">
    <div>
      <h2 id="bought-history-heading" class="text-xl font-bold">Bought history</h2>
      <p class="mt-1 text-sm text-base-content/65">
        Completed Wants remain linked to their ledger entries.
      </p>
    </div>

    <p v-if="error" role="alert" aria-live="polite" class="alert alert-error text-sm">
      {{ error }}
    </p>

    <article
      v-for="item in items"
      :key="item._id"
      class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold">{{ item.name }}</h3>
          <p class="mt-1 text-sm text-base-content/65">
            Purchased {{ purchaseDateLabel(item.purchasedAt) }}
          </p>
        </div>

        <WantsStatusBadge status="bought" />
      </div>

      <p class="mt-3 text-sm">Estimated cost: {{ formatCents(item.estimatedCostCents) }}</p>

      <NuxtLink
        v-if="item.expenseId"
        :to="`/monthly?expense=${item.expenseId}`"
        class="link link-primary mt-3 inline-flex min-h-10 items-center font-semibold"
      >
        View linked ledger entry
      </NuxtLink>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :aria-label="`Correct ${item.name} purchase`"
          :disabled="pendingItemId === item._id"
          @click="emit('correct', item)"
        >
          Correct purchase
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm text-error"
          :aria-label="`Undo ${item.name} purchase`"
          :disabled="pendingItemId === item._id"
          @click="confirmingItemId = item._id"
        >
          Undo purchase
        </button>
      </div>

      <div
        v-if="confirmingItemId === item._id"
        role="alertdialog"
        aria-modal="false"
        :aria-labelledby="`undo-${item._id}-heading`"
        class="mt-4 rounded-xl border border-error/40 bg-error/10 p-4"
      >
        <h4 :id="`undo-${item._id}-heading`" class="font-bold">Undo this purchase?</h4>

        <p class="mt-1 text-sm">
          This removes the linked expense and restores {{ item.name }} to the bottom of Plan for it.
        </p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-error btn-sm"
            :aria-label="`Confirm undo ${item.name} purchase`"
            @click="confirmUndo(item._id)"
          >
            Confirm undo
          </button>

          <button type="button" class="btn btn-ghost btn-sm" @click="confirmingItemId = null">
            Keep purchase
          </button>
        </div>
      </div>
    </article>
  </section>
</template>
