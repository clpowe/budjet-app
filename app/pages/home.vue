<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { selectedMonth, getPreviousMonth, getNextMonth } = useMonthNavigation();

const { data: user, isPending: userLoading } = useConvexQuery(
  api.users.getCurrentUser,
  {}
)

const { data: todaySpendingItems } = useConvexQuery(
  api.spending.getToday,
  computed(() => ({ month: selectedMonth.value }))
)

const { data: total } = useConvexQuery(
  api.spending.getTotal,
  computed(() => ({ month: selectedMonth.value }))
)

const { data: snowball } = useConvexQuery(
  api.snowball.getTotal,
  computed(() => ({ month: selectedMonth.value }))
)

const { data: currentPosition } = useConvexQuery(
  api.spending.getCurrentPosition,
  computed(() => ({
    offset: 0,
    allowance: 45,
    month: selectedMonth.value
  }))
)

const { data: extraDollars } = useConvexQuery(
  api.extraDollars.getTotal,
  {}
)

const left_to_spend = computed(() => {
  return (45 * 30) - (total.value ?? 0)
})

const burn_rate = computed(() => {
  const daysElapsed = new Date().getDate() - new Date(selectedMonth.value).getDate()
  return total.value! / daysElapsed
})

const currentMonth = computed(() => {
  return selectedMonth.value.split(' ')[0] === new Date().toLocaleString('en-US', { month: 'long' }).toLowerCase()
})

const totalToday = computed(() => {
  return todaySpendingItems.value?.reduce((acc, curr) => acc + curr.value, 0) ?? 0;
})

</script>


<template>
  <div v-if="userLoading">
    Waiting...
  </div>

  <template v-else>
    <div v-if="!user?.householdId">
      <complete-profile />
    </div>

    <div v-else>
      <div class="flex justify-between">
        <div>
          <UButton @click="getPreviousMonth">previous</UButton>
          {{ selectedMonth }}
          <UButton @click="getNextMonth">previous</UButton>
        </div>
        <div>
          <div>
            {{ formatMoney(total ?? 0) }}<br />
            total spent
          </div>
          <div>
            {{ formatMoney(left_to_spend ?? 0) }}<br />
            left to spend
          </div>
        </div>
      </div>

      <UCard v-if="currentMonth">
        <template #header>
          <h2>Spent Today</h2>
        </template>
        {{ formatMoney(totalToday ?? 0) }}
        <div class="grid grid-cols-3 gap-4">

          <UCard>
            <template #header>
              <p>Burn Rate</p>
            </template>
            {{ formatMoney(burn_rate ?? 0) }}
          </UCard>
          <UCard>
            <template #header>
              <p>Variance</p>
            </template>
            {{ formatMoney(burn_rate - 45) }}
          </UCard>
          <UCard>
            <template #header>
              <p>Daily Budget</p>
            </template>
            {{ formatMoney(45) }}
          </UCard>

        </div>
        <template #footer>
          <div>
            <USlideover>
              <UButton label="Add Spending" />
              <template #content>
                <spending-add />
              </template>
            </USlideover>
            <UButton to="/today" color="neutral" variant="subtle">Show todays Spending</UButton>
          </div>
        </template>
      </UCard>
      <div>
        <h2>Money left to spend</h2>{{ formatMoney(currentPosition ?? 0) }}
      </div>
      <div>
        <h2>Extra Dollars</h2>{{ formatMoney(extraDollars ?? 0) }}
        <div>
          <USlideover>
            <UButton label="Add Extra Dollars" color="neutral" variant="subtle" />
            <template #content>
              <extra-add />
            </template>
          </USlideover>
          <UButton>Show Extra Dollars</UButton>
        </div>
      </div>

      <div>
        <h2>Snowball</h2>{{ formatMoney(snowball ?? 0) }}
        <UButton>Show Snowball List</UButton>
      </div>
    </div>
  </template>
</template>
