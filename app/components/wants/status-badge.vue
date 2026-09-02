<script setup lang="ts">
import { getWantStatusStrategy, type WantStatus } from "../../utils/want-status";
const props = defineProps<{
  status: WantStatus;
}>();

const strategy = computed(() => getWantStatusStrategy(props.status));
</script>

<template>
  <span>
    {{ strategy.label }}
  </span>
</template>
