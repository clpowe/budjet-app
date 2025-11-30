<script setup lang="ts">
defineProps<{
  amount: number | null;
  title: string;
}>();
</script>

<template>
  <div class="card bg-base-100">
    <div class="card-body text-center justify-center">
      <h3 class="card-title mx-auto">{{ title }}</h3>
      {{ formatMoney(totalToday ?? 0) }}
    </div>
  </div>
</template>
