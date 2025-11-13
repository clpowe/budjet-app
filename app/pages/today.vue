<script setup lang="ts">
const { selectedMonth, getPreviousMonth, getNextMonth } = useMonthNavigation();

import { api } from "../../convex/_generated/api";

const { data: todaySpendingItems } = useConvexQuery(
  api.spending.getToday,
  computed(() => ({ month: selectedMonth.value }))
)
onMounted(() => {
  console.log(todaySpendingItems.value)
})

const { data: total } = useConvexQuery(
  api.spending.getTotal,
  computed(() => ({ month: selectedMonth.value }))
)

const burn_rate = computed(() => {
  const daysElapsed = new Date().getDate() - new Date(selectedMonth.value).getDate()
  return total.value! / daysElapsed
})

const totalToday = computed(() => {
  return todaySpendingItems.value?.reduce((acc, curr) => acc + curr.value, 0) ?? 0;
})


// .reduce((acc, curr) => acc + curr.value, 0);

</script>

<template>
  <UPage>
    <div>
      {{ selectedMonth }} (this should be selected Day)
    </div>
    <div>
      <h2>Spent Today</h2>{{ formatMoney(totalToday ?? 0) }}
      <div>
        <p>Burn Rate</p>
        {{ formatMoney(burn_rate ?? 0) }}
      </div>
      <div>
        <p>Variance</p>
        {{ formatMoney(burn_rate - 45) }}
      </div>
      <div>
        <p>Daily Budget</p>
        {{ formatMoney(45) }}
      </div>
    </div>
    <spending-list />
  </UPage>
</template>
