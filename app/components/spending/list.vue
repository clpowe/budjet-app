<script setup lang="ts">

const list = ref([])
import { api } from "../../../convex/_generated/api";
const { data: spending, isPending: loading } = useConvexQuery(api.spending.getSpending, { month: 'november 2025' })

</script>

<template>
  <div v-for="t in spending" :key="t._id" class="transaction">
    <div>
      {{ t.name }}
    </div>

    <div>
      {{ t.notes }}
    </div>
    <div>
      {{ formatMoney(t.value) }}
    </div>
  </div>
</template>

<style scoped>
.transaction {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 10ch;
}
</style>
