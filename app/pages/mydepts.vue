<script setup lang="ts">
const { totalPayment } = useDebts();
</script>
<template>
  <main class="l-page l-stack">
    <app-main-card
      title="Total Snowball"
      subtitle="Amount to pay on target bill"
      :amount="totalPayment"
    >
      <template #items> </template>
      <template #actions> </template>
    </app-main-card>
    <depts-list />
  </main>
</template>
