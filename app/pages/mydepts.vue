<script setup lang="ts">
const { totalPayment } = useDebts();
const totalPaymentDollars = computed(() =>
  totalPayment.value === undefined ? undefined : Number(totalPayment.value) / 100,
);
</script>
<template>
  <main class="l-page l-stack">
    <app-main-card
      title="Total Snowball"
      subtitle="Amount to pay on target bill"
      :amount="totalPaymentDollars"
    >
      <template #items> </template>
      <template #actions> </template>
    </app-main-card>
    <depts-list />
  </main>
</template>
