<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { queryDayBounds, queryMonthBounds, appDay, elapsedDays } = useDate()
const { user } = useConvexUser()

const currentDate = ref(new Date())

const { data: expenses } = useConvexQuery(
  api.expenses.listMyExpenses,
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
  })),

)

const { data: totalPayment } = useConvexQuery(
  api.depts.getTotalPayment, {}
)


const { data: currentPosition } = useConvexQuery(
  api.expenses.getMyCurrentPosition,
  computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
    allowance: 45,
    householdId: user?.value?.householdId!
  })),
)

const { data: extraDollars } = useConvexQuery(
  api.windfall.getMyWindfallTotal,
  {}
)

const left_to_spend = computed(() => {
  return (45 * 30) - (total.value ?? 0)
})

const burn_rate = computed(() => {
  return total.value! / elapsedDays.value
})

const currentMonth = computed(() => {
  return `${currentDate.value.getMonth()} - ${currentDate.value.getFullYear()}`
})

const totalToday = computed(() => {
  return expenses.value?.reduce((acc, curr) => acc + curr.amount, 0) ?? 0;
})


</script>


<template>
  <div>
    <div>
      <template>
        <div v-if="!user?.householdId">
          <complete-profile />
        </div>

        <div v-else>
          <div>
            <div>
              <button @click="">previous</button>
              {{ appDay }}
              <button @click="">next</button>
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

          <div v-if="currentMonth">
            <div>
              <h2>Spent Today</h2>
            </div>
            {{ formatMoney(totalToday ?? 0) }}
            <div>
              <div>
                <div>
                  <p>Burn Rate</p>
                </div>
                {{ formatMoney(burn_rate ?? 0) }}
              </div>
              <div>
                <div>
                  <p>Variance</p>
                </div>
                {{ formatMoney(burn_rate - 45) }}
              </div>
              <div>
                <div>
                  <p>Daily Budget</p>
                </div>
                {{ formatMoney(45) }}
              </div>

            </div>
            <div>
              <div>
                <div>
                  <div>
                    <spending-add />
                  </div>
                </div>
                <NuxtLink to="/today">Show todays Spending</NuxtLink>
              </div>
            </div>
          </div>
          <div>
            <h2>Money left to spend</h2>{{ formatMoney(currentPosition ?? 0) }}
          </div>
          <div>
            <h2>Extra Dollars</h2>{{ formatMoney(extraDollars ?? 0) }}
            <div>
              <div>
                <button>Add Extra Dollars</button>
                <div>
                  <extra-add />
                </div>
              </div>
              <NuxtLink to="/extraDollars">Show Extra Dollars</NuxtLink>
            </div>
          </div>

          <div>
            <h2>Snowball</h2>{{ formatMoney(totalPayment ?? 0) }}
            <button>Show Snowball List</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
