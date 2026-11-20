<script setup lang="ts">
import { getGoalStatusStrategy, type GoalStatus } from "../../utils/goal-status";
const props = defineProps<{
  status: GoalStatus;
}>();

const strategy = computed(() => getGoalStatusStrategy(props.status));
</script>

<template>
  <span>
    {{ strategy.label }}
  </span>
</template>
