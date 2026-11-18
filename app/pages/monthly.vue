<script setup lang="ts">
import { api } from "../../convex/_generated/api";
import { format } from "@formkit/tempo";
import type { FunctionReturnType } from "convex/server";
import { formatCents } from "../../shared/utils/money-cents";

type Transaction = FunctionReturnType<typeof api.expenses.listMonthlyTransactions>[number];

const { currentDate, goToPreviousMonth, goToNextMonth, timeZone } = useDate();

const params = computed(() => ({ asOfTimestamp: currentDate.value.getTime() }));

const { data: transactions, error } = useConvexQuery(api.expenses.listMonthlyTransactions, params);

watch(error, (newErr) => {
  if (newErr) console.error("Monthly query failed:", newErr);
});

const groupedTransactions = computed(() => {
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions.value ?? []) {
    (groups[tx.localDate] ??= []).push(tx);
  }
  return groups;
});

const sortedDateKeys = computed(() => {
  return Object.keys(groupedTransactions.value).sort((a, b) => b.localeCompare(a));
});

const formatDate = (dateKey: string) => {
  return format({
    date: new Date(dateKey + "T00:00:00Z"),
    format: "dddd, MMM D, YYYY",
    tz: "UTC",
  });
};

const calculateDayTotal = (dateKey: string) => {
  const group = groupedTransactions.value[dateKey];
  if (!group) return 0;
  return group.reduce((acc, tx) => {
    return acc + (tx.type === "expense" ? -tx.amount : tx.amount);
  }, 0);
};

const currentMonthYear = computed(() => {
  return format({
    date: new Date(currentDate.value),
    format: "MMMM YYYY",
    tz: timeZone.value,
  });
});
</script>

<template>
  <main class="l-page l-stack">
    <!-- Header with Navigation -->
    <header class="l-cluster l-split">
      <button type="button" @click="goToPreviousMonth">Previous month</button>
      <h1>{{ currentMonthYear }}</h1>
      <button type="button" @click="goToNextMonth">Next month</button>
    </header>

    <!-- Error State -->
    <p v-if="error" role="alert">Error loading transactions: {{ error.message }}</p>

    <!-- Grouped Transactions -->
    <div v-if="transactions && transactions.length > 0" class="l-stack">
      <details v-for="dateKey in sortedDateKeys" :key="dateKey" open>
        <summary>{{ formatDate(dateKey) }} — {{ formatMoney(calculateDayTotal(dateKey)) }}</summary>
        <div class="u-scroll">
          <table>
            <tbody>
              <tr v-for="tx in groupedTransactions[dateKey]" :key="tx._id">
                <td>
                  <div>
                    <span>{{ tx.name }}</span>
                    <span v-if="tx.type === 'expense' && tx.isWantPurchase"> Want purchase </span>
                  </div>
                  <div v-if="tx.notes">{{ tx.notes }}</div>
                </td>
                <td>
                  <span>
                    {{ tx.type === "expense" ? "-" : "+"
                    }}{{
                      tx.type === "expense" ? formatCents(tx.amountCents) : formatMoney(tx.amount)
                    }}
                  </span>
                  <p v-if="tx.type === 'expense' && tx.reserveUsedCents > 0n">
                    {{ formatCents(tx.amountCents) }} total ·
                    {{ formatCents(tx.reserveUsedCents) }} from reserve ·
                    {{ formatCents(tx.budgetImpactCents) }} budget impact
                  </p>
                </td>
                <td>
                  <span v-if="tx.type === 'windfall'">Windfall</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <!-- Empty State -->
    <p v-else-if="transactions">No transactions found for this month.</p>

    <!-- Loading State -->
    <p v-else role="status">Loading…</p>
  </main>
</template>
