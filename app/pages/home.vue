<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { appDay, setDate } = useDate()

const { data: user, isPending } = useConvexQuery(api.users.getCurrentUser, {})

const { total, totalToday, burn_rate, variance, currentPosition } = useExpenses()
const { windfallTotal } = useWindfall()

setDate(new Date())


const { data: totalPayment } = useConvexQuery(
  api.depts.getTotalPayment, {}
)

const left_to_spend = computed(() => {
  return (45 * 30) - (total.value ?? 0)
})

</script>


<template>
  <div>
    <div v-if="isPending && !user?.householdId && total">
      Loading...
    </div>
    <div v-else>
      <div v-if="!user?.householdId">
        <complete-profile />
      </div>

      <div v-else>
        <div>
          <div>
            <div>
              {{ appDay }}
            </div>
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

        <div>
          <div>
            <h2>Money left to spend Today</h2>{{ formatMoney(currentPosition ?? 0) }}
          </div>
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
              {{ formatMoney(variance ?? 0) }}
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
                  <expenses-add />
                </div>
              </div>
              <NuxtLink to="/today">Show todays Spending</NuxtLink>
            </div>
          </div>
        </div>

        <div>
          <h2>Extra Dollars</h2>{{ formatMoney(windfallTotal ?? 0) }}
          <div>
            <NuxtLink to="/windfall">Show Extra Dollars</NuxtLink>
          </div>
        </div>

        <div>
          <h2>Snowball</h2>{{ formatMoney(totalPayment ?? 0) }}
          <button>Show Snowball List</button>
        </div>
      </div>
    </div>
  </div>
</template>
