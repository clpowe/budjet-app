<template>
  <div class="main-layout">
    <AppHeader />
    <main>
      <slot />
    </main>
  </div>
</template>

<style>
.main-layout {
  display: grid;
  grid-template-areas: "main" "nav";
  grid-template-columns: 1fr;
  grid-template-rows: 1fr auto;
  min-height: 100dvh;
  container-type: inline-size;
  container-name: main-container;

  @media (width >= 500px) {
    grid-template-areas: "nav main";
    grid-template-columns: min-content auto;
    grid-template-rows: 1fr;
  }
}

main {
  grid-area: main;
}
</style>
