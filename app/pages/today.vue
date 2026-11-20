<script setup lang="ts">
import { getLocalDateKey } from "../../shared/utils/local-date";

const { currentDate, localDate, timeZone, goToPreviousDay, goToNextDay, displayDate } = useDate();

const isToday = computed(() => localDate.value >= getLocalDateKey(Date.now(), timeZone.value));

onMounted(() => {
  currentDate.value = new Date();
});

const {
  expenses,
  totalToday,
  averageDailySpend,
  variance,
  remainingTodayDollars,
  safeToSpendPerDay,
  dailyAllowanceDollars,
  removeExpense,
} = useExpenses();

const transactionDialog = ref<HTMLDialogElement | null>(null);

function openTransactionDialog() {
  transactionDialog.value?.showModal();
}
</script>

<template>
  <main class="l-page l-stack">
    <header class="l-cluster l-split">
      <button type="button" @click="goToPreviousDay">Previous day</button>
      <h1>{{ displayDate }}</h1>
      <button type="button" @click="goToNextDay" :disabled="isToday">Next day</button>
    </header>
    <app-main-card
      title="Budget Overview"
      subtitle="Your current budget status"
      :amount="remainingTodayDollars!"
    >
      <template #items>
        <mini-card title="Spent today" :amount="totalToday" />
        <mini-card title="Average daily spending" :amount="averageDailySpend" />
        <mini-card title="Over/under budget" :amount="variance" />
        <mini-card title="Daily Budget" :amount="dailyAllowanceDollars" />
        <mini-card title="Rolling Budget" :amount="safeToSpendPerDay" />
      </template>
      <template #actions> </template>
    </app-main-card>
    <button type="button" @click="openTransactionDialog">Add expense</button>
    <dialog id="transaction-dialog" ref="transactionDialog">
      <header class="l-cluster l-split">
        <h2>Add expense</h2>
        <form method="dialog"><button type="submit">Close</button></form>
      </header>
      <expenses-add />
    </dialog>
    <expenses-list :expenses="expenses ?? []" :remove="removeExpense" />
  </main>
</template>
