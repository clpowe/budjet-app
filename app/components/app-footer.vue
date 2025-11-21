<script setup lang="ts">
const { selectedMonth, getPreviousMonth, getNextMonth } = useMonthNavigation();
</script>

<template>
  <footer>
    <div>
      <button @click="getPreviousMonth">previous</button>
      {{ selectedMonth }}
      <button @click="getNextMonth">next</button>
    </div>
    <div>
      <spending-add />
    </div>
  </footer>
</template>