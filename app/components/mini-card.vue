<script setup lang="ts">
type BudgetMetric = {
  value: number;
  isWithinBudget: boolean;
};

const props = defineProps<{
  amount: BudgetMetric | number;
  title: string;
}>();

const displayAmount = computed(() => {
  if (typeof props.amount === "number") {
    return props.amount;
  }

  return props.amount.value;
});
</script>

<template>
  <article>
    <h3>{{ title }}</h3>
    <p>{{ formatMoney(displayAmount) }}</p>
  </article>
</template>
