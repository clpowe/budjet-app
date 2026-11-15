<template>
  <section aria-label="Month" class="section">
    <div>Chart</div>
    <div>Top Catagories</div>
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
