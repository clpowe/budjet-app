<script setup lang="ts">

import { api } from "../../convex/_generated/api";

const { data } = useConvexQuery(
  api.extraDollars.getTotal,
)

const { data: total } = useConvexQuery(
  api.extraDollars.getExtraDollars,
)
</script>

<template>
  <UPage>
    <div>
      <h2>Spent Today</h2>{{ formatMoney(data ?? 0) }}
    </div>
    <extra-list />
  </UPage>
</template>
