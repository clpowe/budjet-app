<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const selected_month = ref('november 2025')

const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {})
const { data, isPending: todayLoading } = useConvexQuery(api.spending.getToday, { month: selected_month.value })
const { data: total, isPending: totalLoading } = useConvexQuery(api.spending.getTotal, { month: selected_month.value })
const { data: snowball, isPending: snowballLoading } = useConvexQuery(api.snowball.getTotal, { month: selected_month.value })
const { data: currentPosition, isPending: posLoading } = useConvexQuery(api.spending.getCurrentPosition, { offset: 0, allowance: 45, month: selected_month.value })
const { data: extraDollars, isPending: extraLoading } = useConvexQuery(api.extraDollars.getTotal)
const left_to_spend = computed(() => {
  return (45 * 30) - total.value!
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
          {{ selected_month }}
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
        <h2>Spent Today</h2>{{ formatMoney(data ?? 0) }}
        <spending-add />
        <spending-list />
      </div>
      <div>
        <h2>Money left to spend</h2>{{ formatMoney(currentPosition ?? 0) }}
      </div>
      <div>
        <h2>Extra Dollars</h2>{{ formatMoney(extraDollars ?? 0) }}
        <extra-add />
        <extra-list />
      </div>

      <div>
        <h2>Snowball</h2>{{ formatMoney(snowball ?? 0) }}
        <Snowball-list />
      </div>
    </div>
  </template>
</template>
