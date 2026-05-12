<script setup lang="ts">
import { dayStart } from "@formkit/tempo";
definePageMeta({
  middleware: ["auth"],
});

const { currentDate, backDay, forwardDay, appDay } = useDate();

onMounted(() => {
  currentDate.value = new Date();
});

const {
  expenses,
  totalToday,
  burn_rate,
  variance,
  currentPosition,
  rollingBudget,
  dailyBudget,
  remove,
} = useExpenses();

const transactionDrawerToggle = ref<HTMLInputElement | null>(null);

function openTransactionDrawer() {
  if (transactionDrawerToggle.value) {
    transactionDrawerToggle.value.checked = true;
  }
}
</script>

<template>
  <div class="px-4 container mx-auto space-y-8">
    <div class="flex items-center justify-between pt-4">
      <button
        @click="backDay"
        class="btn btn-circle btn-ghost"
        aria-label="Previous day"
        title="Previous day"
      >
        <Icon name="i-heroicons-chevron-left" class="size-6" />
      </button>
      <div class="text-center">
        <h1 class="text-2xl font-bold">{{ appDay }}</h1>
      </div>
      <button
        @click="forwardDay"
        class="btn btn-circle btn-ghost text-primary"
        :disabled="dayStart(currentDate).getTime() >= dayStart(new Date()).getTime()"
        aria-label="Next day"
        title="Next day"
      >
        <Icon name="i-heroicons-chevron-right" class="size-6" />
      </button>
    </div>
    <app-main-card
      title="Budget Overview"
      subtitle="Your current budget status"
      :amount="currentPosition!"
    >
      <template #items>
        <mini-card title="Spent Today" :amount="totalToday" />
        <mini-card title="Burn Rate" :amount="burn_rate" />
        <mini-card title="Variance" :amount="variance" />
        <mini-card title="Daily Budget" :amount="dailyBudget" />
        <mini-card title="Rolling Budget" :amount="rollingBudget" />
      </template>
      <template #actions> </template>
    </app-main-card>
    <div class="drawer drawer-end w-full">
      <input
        id="my-drawer-5"
        ref="transactionDrawerToggle"
        type="checkbox"
        class="drawer-toggle w-full"
      />
      <div class="drawer-content">
        <button type="button" class="drawer-button btn btn-primary" @click="openTransactionDrawer">
          Add transaction
        </button>
      </div>
      <div class="drawer-side">
        <label for="my-drawer-5" aria-label="close sidebar" class="drawer-overlay"></label>
        <ul class="menu bg-base-200 min-h-full w-80 p-4">
          <expenses-add />
        </ul>
      </div>
    </div>
    <expenses-list :expenses="expenses ?? []" :remove="remove" />
  </div>
</template>
