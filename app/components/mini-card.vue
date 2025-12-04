<script setup lang="ts">
defineProps<{
  amount: number;
  title: string;
  indicator?: boolean;
}>();
</script>

<template>
  <div
    class="card bg-base-100"
    :class="[
      indicator ? 'border-t-8' : '',
      indicator && amount < 0 ? 'border-red-500' : '',
      indicator && amount >= 0 ? 'border-green-500' : '',
    ]"
  >
    <div class="card-body text-center justify-center">
      <h3 class="card-title mx-auto">{{ title }}</h3>
      {{ formatMoney(amount) }}
    </div>
  </div>
</template>
