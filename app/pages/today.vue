<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { currentDate, queryDayBounds, queryMonthBounds, appDay, elapsedDays, backDay, forwardDay } = useDate()

onMounted(() => {
  currentDate.value = new Date()
})

const { data: currentPosition, suspense } = useConvexQuery(
  api.expenses.getMyTotal,
  computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
  })),
)


const { data: total } = useConvexQuery(
  api.expenses.getMyTotal,
  computed(() => ({
    from: queryMonthBounds.value.from,
    to: queryMonthBounds.value.to,
  })
  ))

const burn_rate = computed(() => {
  return total.value! / elapsedDays.value
})

const variance = computed(() => {
  return (45 * elapsedDays.value) - total.value!
})

</script>

<template>
  <div>

    <button @click="backDay">back</button>
    <div>
      {{ appDay }}
    </div>
    <button @click="forwardDay">forward</button>
    <div>
      <h2>Spent Today</h2>{{ formatMoney(currentPosition ?? 0) }}
      <div>
        <p>Burn Rate</p>
        {{ formatMoney(burn_rate ?? 0) }}
      </div>
      <div>
        <p>Variance</p>
        {{ formatMoney(variance ?? 0) }}
      </div>
      <div>
        <p>Daily Budget</p>
        {{ formatMoney(45) }}
      </div>
    </div>
    <expenses-add />
    <expenses-list />
  </div>
</template>
