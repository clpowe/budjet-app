<script setup lang="ts">
import { api } from "../convex/_generated/api";
const { data } = useConvexQuery(api.spending.getToday, {
  month: "november 2025"
});
</script>

<template>
  <div>
    <h1>Tasks</h1>
    {{ data }}
  </div>
</template>
