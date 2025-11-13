<script setup lang="ts">
const { selectedMonth, getPreviousMonth, getNextMonth } = useMonthNavigation();
</script>

<template>
  <footer>
    <div>
      <UButton @click="getPreviousMonth">previous</UButton>
      {{ selectedMonth }}
      <UButton @click="getNextMonth">previous</UButton>
    </div>
    <USlideover>
      <UButton label="Add Spending" color="neutral" variant="subtle" />
      <template #content>
        <spending-add />
      </template>
    </USlideover>

  </footer>
</template>
