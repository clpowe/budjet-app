<script setup lang="ts">
const { totalPayment } = useDebts();
const totalPaymentDollars = computed(() =>
  totalPayment.value === undefined ? undefined : Number(totalPayment.value) / 100,
);
</script>
<template>
  <main class="l-page l-stack">
    <app-main-card
      title="Total debt payments"
      subtitle="Sum of every debt payment"
      :amount="totalPaymentDollars"
    >
      <template #items> </template>
      <template #actions> </template>
    </app-main-card>
    <debts-add />
    <debts-list />
  </main>
</template>
