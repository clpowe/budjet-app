<script setup lang="ts">
const { totalPayment } = useDepts()
</script>
<template>
  <div>
    {{ formatMoney(totalPayment ?? 0) }}
    <depts-list />
  </div>

</template>
