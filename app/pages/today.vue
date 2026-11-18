<script setup lang="ts">
import { dayStart } from "@formkit/tempo";

const { currentDate, goToPreviousDay, goToNextDay, displayDate } = useDate();

onMounted(() => {
  currentDate.value = new Date();
});

const {
  expenses,
  totalToday,
  burnRate,
  variance,
  remainingTodayDollars,
  rollingBudget,
  dailyBudget,
  remove,
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
      <button
        type="button"
        @click="goToNextDay"
        :disabled="dayStart(currentDate).getTime() >= dayStart(new Date()).getTime()"
      >
        Next day
      </button>
    </header>
    <app-main-card
      title="Budget Overview"
      subtitle="Your current budget status"
      :amount="remainingTodayDollars!"
    >
      <template #items>
        <mini-card title="Spent today" :amount="totalToday" />
        <mini-card title="Average daily spending" :amount="burnRate" />
        <mini-card title="Over/under budget" :amount="variance" />
        <mini-card title="Daily Budget" :amount="dailyBudget" />
        <mini-card title="Rolling Budget" :amount="rollingBudget" />
      </template>
      <template #actions> </template>
    </app-main-card>
    <button type="button" @click="openTransactionDialog">Add transaction</button>
    <dialog id="transaction-dialog" ref="transactionDialog">
      <header class="l-cluster l-split">
        <h2>Add transaction</h2>
        <form method="dialog"><button type="submit">Close</button></form>
      </header>
      <expenses-add />
    </dialog>
    <expenses-list :expenses="expenses ?? []" :remove="remove" />
  </main>
</template>
