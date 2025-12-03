<script setup lang="ts">
const { currentDate } = useDate();

onMounted(() => {
  currentDate.value = new Date();
});

const { totalToday, burn_rate, variance, currentPosition } = useExpenses();
</script>

<template>
  <div class="px-4 container mx-auto space-y-8">
    <app-main-card
      title="Budget Overview"
      subtitle="Your current budget status"
      :amount="currentPosition!"
    >
      <template #items>
        <mini-card title="Spent Today" :amount="totalToday" />
        <mini-card title="Burn Rate" :amount="burn_rate" />
        <mini-card title="Variance" :amount="variance" />
        <mini-card title="Daily Budget" :amount="50" />
      </template>
      <template #actions> </template>
    </app-main-card>
    <div class="drawer drawer-end w-full">
      <input id="my-drawer-5" type="checkbox" class="drawer-toggle w-full" />
      <div class="drawer-content">
        <label for="my-drawer-5" class="drawer-button btn btn-primary"
          >Add transaction</label
        >
      </div>
      <div class="drawer-side">
        <label
          for="my-drawer-5"
          aria-label="close sidebar"
          class="drawer-overlay"
        ></label>
        <ul class="menu bg-base-200 min-h-full w-80 p-4">
          <expenses-add />
        </ul>
      </div>
    </div>
    <expenses-list />
  </div>
</template>
