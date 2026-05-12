<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  amount?: number;
}>();
</script>

<template>
  <section
    class="rounded-sm border border-base-300 bg-base-100 p-5 shadow-sm sm:p-8"
    :aria-labelledby="`${title}-heading`"
  >
    <div class="grid gap-6">
      <div>
        <h2 :id="`${title}-heading`" class="text-sm font-semibold text-base-content/70">
          {{ title }}
        </h2>
        <div class="mt-2">
          <p v-if="amount !== undefined" class="text-5xl font-black leading-none sm:text-6xl">
            {{ formatMoney(amount) }}
          </p>
          <p v-if="subtitle" class="mt-3 max-w-lg text-sm text-base-content/70">
            {{ subtitle }}
          </p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <slot name="items" />
      </div>

      <div class="card-actions w-full grid grid-cols-1 sm:grid-cols-2 items-center gap-2 md:gap-4">
        <slot name="actions"></slot>
      </div>
    </div>
  </section>
</template>
