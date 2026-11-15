<script setup></script>
<template>
  <section aria-label="Today" class="section">
    <div>Last 3</div>
    <div>
      <div>Form</div>
      <div>cusion</div>
    </div>
  </section>
</template>

<style scoped>
.section {
  display: grid;
  grid-template-columns: 1fr;

  @container content-container (width > 600px) {
    grid-template-columns: 2fr 1fr;
  }
}
</style>
