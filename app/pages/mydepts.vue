<script setup lang="ts">
const { totalPayment } = useDepts();
</script>
<template>
  <div class="px-4 container mx-auto space-y-8">
    <app-main-card
      title="Total Snowball"
      subtitle="Amount to pay on target bill"
      :amount="totalPayment"
    >
      <template #items> </template>
      <template #actions> </template>
    </app-main-card>
    <depts-list />
  </div>
</template>
