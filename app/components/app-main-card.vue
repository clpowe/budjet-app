<script setup lang="ts">
defineProps<{
  title: string;
  subtitle: string;
  amount: number;
}>();
</script>

<template>
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body gap-4">
      <h2 class="card-title mx-auto text-3xl">{{ title }}</h2>
      <div class="grid gap-3">
        <div class="mx-auto text-center">
          <p class="text-4xl font-bold">
            {{ formatMoney(amount ?? 0) }}
          </p>
          <p class="text-base-content">{{ subtitle }}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <slot name="items" />
        </div>
      </div>
      <div
        class="card-actions w-full grid grid-cols-1 sm:grid-cols-2 items-center gap-2 md:gap-4"
      >
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>
