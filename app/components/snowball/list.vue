<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const { data: spending, isPending: loading } =
  useConvexQuery(api.snowball.getSnowball)

const { mutate: update } =
  useConvexMutation(api.snowball.toggleSnowball)

async function handleSnowball(id: Id<"snowball">, value: boolean) {
  if (!id) return
  await update({ id, value: !value })
}
</script>

<template>
  <div v-for="t in spending" :key="t._id">
    <div>
      {{ t.name }}
    </div>
    <div>
      {{ formatMoney(t.amount) }}
    </div>
    <div>
      <button @click="handleSnowball(t._id as Id<'snowball'>, t.snowball)">
        {{ t.snowball }}
      </button>
    </div>
  </div>
</template>