<script setup lang="ts">
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/utils/money-cents";

const { appDay, setDate } = useDate();

const { summary, safeToSpendCents, totalToday, burn_rate, variance, currentPosition } =
  useExpenses();

const { windfallTotal } = useWindfall();

setDate(new Date());

const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {});

const safeToSpendState = computed(() => {
  if (safeToSpendCents.value < 0n) {
    return {
      label: "Over plan",
      tone: "text-error",
      helper: "Pull back on spending until this returns above zero.",
    };
  }

  return {
    label: "Safe to spend",
    tone: "text-success",
    helper: "Your 30-day plan after budget-impact spending and finalized Want set-asides.",
  };
});
</script>

<template>
  <main class="container mx-auto space-y-6 px-4 py-5 sm:space-y-8 sm:py-8">
    <section
      class="rounded-sm border border-base-300 bg-base-100 p-5 shadow-sm sm:p-8"
      aria-labelledby="today-position-heading"
    >
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div class="space-y-5">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p class="text-sm font-semibold uppercase text-base-content/60">
              {{ appDay }}
            </p>
            <p class="text-sm text-base-content/60">Today&apos;s position</p>
          </div>

          <div>
            <p id="today-position-heading" class="text-sm font-semibold text-base-content/70">
              {{ safeToSpendState.label }}
            </p>
            <p
              class="mt-2 text-5xl font-black leading-none sm:text-7xl"
              :class="safeToSpendState.tone"
            >
              {{ formatCents(safeToSpendCents) }}
            </p>
            <p class="mt-3 max-w-lg text-sm text-base-content/70">
              {{ safeToSpendState.helper }}
            </p>
          </div>
        </div>

        <div class="drawer drawer-end w-full lg:w-auto">
          <input id="transaction-drawer" type="checkbox" class="drawer-toggle" />
          <div class="drawer-content flex flex-col items-stretch gap-3 sm:items-start lg:items-end">
            <label
              for="transaction-drawer"
              class="drawer-button btn btn-primary min-h-12 w-full gap-2 px-6 text-base shadow-md sm:w-auto"
            >
              <Icon name="i-heroicons-plus" class="size-5" />
              Add transaction
            </label>
            <NuxtLink
              to="/today"
              class="link link-hover inline-flex min-h-9 items-center justify-center text-sm font-semibold text-base-content/70 sm:justify-start"
            >
              View today&apos;s spending
            </NuxtLink>
          </div>
          <div class="drawer-side">
            <label
              for="transaction-drawer"
              aria-label="close sidebar"
              class="drawer-overlay"
            ></label>
            <div class="menu min-h-full w-80 bg-base-200 p-4">
              <expenses-add />
            </div>
          </div>
        </div>
      </div>

      <div class="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Spent so far</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatCents(summary?.expenseCents ?? 0n) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Budget impact</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatCents(summary?.budgetImpactExpenseCents ?? 0n) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Reserved this plan</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatCents(summary?.currentPlanSetAsideCents ?? 0n) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Goal reserve</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatCents(summary?.availableReserveCents ?? 0n) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Potential tonight</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatCents(summary?.potentialTonightCents ?? 0n) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Money left today</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatMoney(currentPosition ?? 0) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Spent today</p>
          <p class="mt-1 text-2xl font-bold">
            {{ formatMoney(totalToday.value) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Average daily spending</p>
          <p
            class="mt-1 text-2xl font-bold"
            :class="burn_rate.positive ? 'text-success' : 'text-error'"
          >
            {{ formatMoney(burn_rate.value) }}
          </p>
        </div>
        <div class="border-t border-base-300 pt-4">
          <p class="text-sm text-base-content/60">Over/under budget</p>
          <p
            class="mt-1 text-2xl font-bold"
            :class="variance.positive ? 'text-success' : 'text-error'"
          >
            {{ formatMoney(variance.value) }}
          </p>
        </div>
      </div>
    </section>

    <SpendingMonthlyChart />

    <section class="grid gap-x-8 gap-y-4 lg:grid-cols-2" aria-label="Secondary balances">
      <article class="border-t border-base-300 py-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 class="text-sm font-semibold text-base-content/70">Windfall</h2>
            <p class="mt-1 text-3xl font-bold">
              {{ formatMoney(windfallTotal ?? 0) }}
            </p>
          </div>

          <div class="flex min-h-10 items-center gap-1">
            <div class="drawer drawer-end w-auto">
              <input id="windfall-drawer" type="checkbox" class="drawer-toggle" />
              <div class="drawer-content">
                <label
                  for="windfall-drawer"
                  class="drawer-button btn btn-ghost btn-circle btn-sm"
                  aria-label="Add windfall"
                  title="Add windfall"
                >
                  <Icon name="i-heroicons-plus" class="size-4" />
                </label>
              </div>
              <div class="drawer-side">
                <label
                  for="windfall-drawer"
                  aria-label="close sidebar"
                  class="drawer-overlay"
                ></label>
                <div class="menu min-h-full w-80 bg-base-200 p-4">
                  <windfall-add drawer-id="windfall-drawer" />
                </div>
              </div>
            </div>

            <NuxtLink
              to="/windfall"
              class="btn btn-ghost btn-circle btn-sm"
              aria-label="View windfall"
              title="View windfall"
            >
              <Icon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
            </NuxtLink>
          </div>
        </div>
      </article>

      <article class="border-t border-base-300 py-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 class="text-sm font-semibold text-base-content/70">Debt snowball</h2>
            <p class="mt-1 text-3xl font-bold">
              {{ formatMoney(totalPayment ?? 0) }}
            </p>
          </div>

          <div class="flex min-h-10 items-center gap-1">
            <div class="drawer drawer-end w-auto">
              <input id="snowball-drawer" type="checkbox" class="drawer-toggle" />
              <div class="drawer-content">
                <label
                  for="snowball-drawer"
                  class="drawer-button btn btn-ghost btn-circle btn-sm"
                  aria-label="Add debt"
                  title="Add debt"
                >
                  <Icon name="i-heroicons-plus" class="size-4" />
                </label>
              </div>
              <div class="drawer-side">
                <label
                  for="snowball-drawer"
                  aria-label="close sidebar"
                  class="drawer-overlay"
                ></label>
                <div class="menu min-h-full w-80 bg-base-200 p-4">
                  <depts-add />
                </div>
              </div>
            </div>

            <NuxtLink
              to="/mydepts"
              class="btn btn-ghost btn-circle btn-sm"
              aria-label="View debts"
              title="View debts"
            >
              <Icon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
            </NuxtLink>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
