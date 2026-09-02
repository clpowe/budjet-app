<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  amount?: number;
}>();
</script>

<template>
  <section class="panel l-stack" :aria-labelledby="`${title}-heading`">
    <div class="l-stack">
      <div>
        <h2 :id="`${title}-heading`">{{ title }}</h2>
        <div>
          <p v-if="amount !== undefined" class="metric">{{ formatMoney(amount) }}</p>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <div class="l-grid">
        <slot name="items" />
      </div>

      <div class="actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </section>
</template>
