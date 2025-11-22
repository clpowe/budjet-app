<script setup lang="ts">

import { api } from "../../convex/_generated/api";

const { data } = useConvexQuery(
  api.windfall.getMyWindfallTotal,
)
</script>

<template>
  <div>
    <div>
      <h2>Spent Today</h2>{{ formatMoney(data ?? 0) }}
    </div>
    <windfall-add />
    <windfall-list />
  </div>
</template>
