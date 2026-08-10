<script setup lang="ts">
import { api } from "../../convex/_generated/api";
import { format } from "@formkit/tempo";

definePageMeta({
  middleware: ["auth"],
});

const { currentDate, queryMonthBounds, backMonth, forwardMonth } = useDate();

const params = computed(() => ({
  from: queryMonthBounds.value.from,
  to: queryMonthBounds.value.to,
}));

const { data: transactions, error } = useConvexQuery(api.expenses.listMonthlyTransactions, params);

watch(error, (newErr) => {
  if (newErr) console.error("Monthly query failed:", newErr);
});

const groupedTransactions = computed(() => {
  if (!transactions.value) return {};

  const groups: Record<string, any[]> = {};

  transactions.value.forEach((tx) => {
    if (!tx.date) return;

    // Use YYYY-MM-DD for stable internal keys
    const dateKey = format({
      date: new Date(tx.date),
      format: "YYYY-MM-DD",
      tz: "America/New_York",
    });

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(tx);
  });

  return groups;
});

const sortedDateKeys = computed(() => {
  return Object.keys(groupedTransactions.value).sort((a, b) => b.localeCompare(a));
});

const formatDate = (dateKey: string) => {
  return format({
    date: new Date(dateKey + "T00:00:00"),
    format: "dddd, MMM D, YYYY",
    tz: "America/New_York",
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
    tz: "America/New_York",
  });
});
</script>

<template>
  <div class="container mx-auto p-4 space-y-6">
    <!-- Header with Navigation -->
    <div class="flex items-center justify-between">
      <button @click="backMonth" class="btn btn-circle btn-ghost">
        <Icon name="i-heroicons-chevron-left" class="size-6" />
      </button>
      <div class="text-center">
        <h1 class="text-2xl font-bold">{{ currentMonthYear }}</h1>
      </div>
      <button @click="forwardMonth" class="btn btn-circle btn-ghost">
        <Icon name="i-heroicons-chevron-right" class="size-6" />
      </button>
    </div>

    <!-- Error State -->
    <div v-if="error" class="alert alert-error shadow-lg">
      <Icon name="i-heroicons-exclamation-triangle" class="size-6" />
      <span>Error loading transactions: {{ error.message }}</span>
    </div>

    <!-- Grouped Transactions -->
    <div v-if="transactions && transactions.length > 0" class="space-y-4">
      <div
        v-for="dateKey in sortedDateKeys"
        :key="dateKey"
        class="collapse collapse-arrow bg-base-200"
      >
        <input type="checkbox" checked />
        <div class="collapse-title flex justify-between items-center pr-12">
          <span class="font-medium">{{ formatDate(dateKey) }}</span>
          <span :class="calculateDayTotal(dateKey) >= 0 ? 'text-success' : 'text-error'">
            {{ formatMoney(calculateDayTotal(dateKey)) }}
          </span>
        </div>
        <div class="collapse-content">
          <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <tbody>
                <tr v-for="tx in groupedTransactions[dateKey]" :key="tx._id">
                  <td>
                    <div class="font-bold">{{ tx.name }}</div>
                    <div v-if="tx.notes" class="text-sm opacity-50">{{ tx.notes }}</div>
                  </td>
                  <td class="text-right">
                    <span :class="tx.type === 'expense' ? 'text-error' : 'text-success'">
                      {{ tx.type === "expense" ? "-" : "+" }}{{ formatMoney(tx.amount) }}
                    </span>
                  </td>
                  <td class="w-10">
                    <span
                      v-if="tx.type === 'windfall'"
                      class="badge badge-success badge-outline badge-sm"
                      >Windfall</span
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="transactions" class="text-center py-20 opacity-50">
      <Icon name="i-heroicons-banknotes" class="size-12 mx-auto mb-4" />
      <p>No transactions found for this month.</p>
    </div>

    <!-- Loading State -->
    <div v-else class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  </div>
</template>
