<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { data: user, isPending: userLoading } = useConvexQuery(api.users.getCurrentUser, {})
const { data, isPending: todayLoading } = useConvexQuery(api.spending.getToday, { month: 'november 2025' })
const { data: total, isPending: totalLoading } = useConvexQuery(api.spending.getTotal, { month: 'november 2025' })
const { data: snowball, isPending: snowballLoading } = useConvexQuery(api.snowball.getTotal, { month: 'november 2025' })
const { data: currentPosition, isPending: posLoading } = useConvexQuery(api.spending.getCurrentPosition, { offset: 0, allowance: 45, month: 'november 2025' })
const { data: extraDollars, isPending: extraLoading } = useConvexQuery(api.extraDollars.getTotal)

</script>

<template>
  <header>
    <SignInButton />
    <SignOutButton />
  </header>

  <div v-if="userLoading">
    Waiting...
  </div>

  <template v-else>
    <div v-if="!user?.householdId">
      <complete-profile />
    </div>

    <div v-else>
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
        <h2>Monthly Total</h2>{{ formatMoney(total ?? 0) }}
      </div>
      <div>
        <h2>Snowball</h2>{{ formatMoney(snowball ?? 0) }}
      </div>
    </div>
  </template>
</template>
