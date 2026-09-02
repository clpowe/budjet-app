<script setup lang="ts">
import { api } from "../../convex/_generated/api";
import { formatCents } from "../../shared/utils/money-cents";

const { appDay, formatDateInput, localDate, setDate } = useDate();

const { summary, safeToSpendCents, totalToday, burn_rate, variance, currentPosition } =
  useExpenses();

const { windfallTotal } = useWindfall();

setDate(new Date());

const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {});

const transactionDialog = shallowRef<HTMLDialogElement | null>(null);
const windfallDialog = shallowRef<HTMLDialogElement | null>(null);
const debtDialog = shallowRef<HTMLDialogElement | null>(null);

function openDialog(dialog: HTMLDialogElement | null) {
  dialog?.showModal();
}

const safeToSpendState = computed(() => {
  if (safeToSpendCents.value < 0n) {
    return {
      label: "Over plan",
      helper: "Pull back on spending until this returns above zero.",
    };
  }

  return {
    label: "Safe to spend",
    helper: "Your 30-day plan after budget-impact spending and finalized Want set-asides.",
  };
});

const nextPlannedWantTargetLocalDate = computed(() => {
  const targetDate = summary.value?.nextPlannedWant?.targetDate;

  return targetDate === undefined ? undefined : formatDateInput(new Date(targetDate));
});
</script>

<template>
  <main class="l-page l-stack">
    <section class="panel l-stack" aria-labelledby="today-position-heading">
      <header class="l-cluster l-split">
        <div>
          <p>{{ appDay }}</p>
          <h1 id="today-position-heading">{{ safeToSpendState.label }}</h1>
          <p class="metric">{{ formatCents(safeToSpendCents) }}</p>
          <p>{{ safeToSpendState.helper }}</p>
        </div>

        <div class="actions">
          <button type="button" @click="openDialog(transactionDialog)">Add transaction</button>
          <NuxtLink to="/today">View today&apos;s spending</NuxtLink>
        </div>
      </header>

      <dialog id="transaction-dialog" ref="transactionDialog">
        <header class="l-cluster l-split">
          <h2>Add transaction</h2>
          <form method="dialog"><button type="submit">Close</button></form>
        </header>
        <expenses-add />
      </dialog>

      <dl class="l-grid">
        <div>
          <dt>Spent so far</dt>
          <dd>{{ formatCents(summary?.spending.monthToDate.expenseCents ?? 0n) }}</dd>
        </div>
        <div>
          <dt>Budget impact</dt>
          <dd>{{ formatCents(summary?.spending.monthToDate.budgetImpactCents ?? 0n) }}</dd>
        </div>
        <div>
          <dt>Reserved this plan</dt>
          <dd>{{ formatCents(summary?.plan.closedPositiveReserveContributionCents ?? 0n) }}</dd>
        </div>
        <div>
          <dt>Goal reserve</dt>
          <dd>{{ formatCents(summary?.reserve.availableCents ?? 0n) }}</dd>
        </div>
        <div>
          <dt>Potential tonight</dt>
          <dd>{{ formatCents(summary?.reserve.projectedEndOfDayContributionCents ?? 0n) }}</dd>
        </div>
        <div>
          <dt>Money left today</dt>
          <dd>{{ formatMoney(currentPosition ?? 0) }}</dd>
        </div>
        <div>
          <dt>Spent today</dt>
          <dd>{{ formatMoney(totalToday.value) }}</dd>
        </div>
        <div>
          <dt>Average daily spending</dt>
          <dd>{{ formatMoney(burn_rate.value) }}</dd>
        </div>
        <div>
          <dt>Over/under budget</dt>
          <dd>{{ formatMoney(variance.value) }}</dd>
        </div>
      </dl>
    </section>

    <WantsNextPlannedWantCard
      v-if="summary"
      :summary="summary"
      :today-local-date="localDate"
      :target-local-date="nextPlannedWantTargetLocalDate"
    />

    <SpendingMonthlyChart />

    <section class="l-grid" aria-label="Secondary balances">
      <article class="panel l-stack">
        <div>
          <h2>Windfall</h2>
          <p>{{ formatMoney(windfallTotal ?? 0) }}</p>
        </div>
        <div class="actions">
          <button type="button" @click="openDialog(windfallDialog)">Add windfall</button>
          <NuxtLink to="/windfall">View windfall</NuxtLink>
        </div>
        <dialog id="windfall-dialog" ref="windfallDialog">
          <header class="l-cluster l-split">
            <h2>Add windfall</h2>
            <form method="dialog"><button type="submit">Close</button></form>
          </header>
          <windfall-add drawer-id="windfall-dialog" />
        </dialog>
      </article>

      <article class="panel l-stack">
        <div>
          <h2>Debt snowball</h2>
          <p>{{ formatMoney(totalPayment ?? 0) }}</p>
        </div>
        <div class="actions">
          <button type="button" @click="openDialog(debtDialog)">Add debt</button>
          <NuxtLink to="/mydepts">View debts</NuxtLink>
        </div>
        <dialog id="debt-dialog" ref="debtDialog">
          <header class="l-cluster l-split">
            <h2>Add debt</h2>
            <form method="dialog"><button type="submit">Close</button></form>
          </header>
          <depts-add />
        </dialog>
      </article>
    </section>
  </main>
</template>
