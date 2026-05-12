<script setup lang="ts">
type MoneyState = {
  value: number;
  positive: boolean;
};

const props = defineProps<{
  amount: MoneyState | number;
  title: string;
}>();

const displayAmount = computed(() => {
  if (typeof props.amount === "number") {
    return {
      value: props.amount,
      toneClass: "",
    };
  }

  return {
    value: props.amount.value,
    toneClass: props.amount.positive ? "text-success" : "text-error",
  };
});
</script>

<template>
  <div class="min-w-0 border-t border-base-300 pt-4">
    <h3 class="text-sm text-base-content/60">{{ title }}</h3>
    <p class="mt-1 text-2xl font-bold" :class="displayAmount.toneClass">
      {{ formatMoney(displayAmount.value) }}
    </p>
  </div>
</template>
