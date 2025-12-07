<script setup lang="ts">
defineProps<{
  amount:
    | {
        value: number;
        positive: boolean;
      }
    | number;
  title: string;
}>();
</script>

<template>
  <div
    class="card bg-base-100"
    :class="[
      amount.positive ? 'border-t-8' : '',
      amount.positive && amount.value < 0 ? 'border-red-500' : '',
      amount.positive && amount.value >= 0 ? 'border-green-500' : '',
    ]"
  >
    <div class="card-body text-center justify-center">
      <h3 class="card-title mx-auto">{{ title }}</h3>
      {{ formatMoney(amount.value) }}
    </div>
  </div>
</template>
