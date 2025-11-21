<script setup lang="ts">

import { api } from "../../convex/_generated/api";

const { queryDayBounds, queryMonthBounds, appDay, elapsedDays, backDay, forwardDay } = useDate()
const { user } = useConvexUser()



const { data: currentPosition } = useConvexQuery(
  api.expenses.getMyTotal,
  computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
    householdId: user?.value?.householdId!
  })),
)

const { data: total } = useConvexQuery(
  api.expenses.getMyTotal,
  computed(() => ({
    from: queryMonthBounds.value.from,
    to: queryMonthBounds.value.to,
    householdId: user?.value?.householdId!
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
    <div>
      {{ appDay }}
    </div>
    <button @click="backDay">back</button>
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
    <spending-list />
  </div>
</template>
