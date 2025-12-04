<script setup lang="ts">
import { api } from "../../convex/_generated/api";

definePageMeta({
  middleware: ["auth"],
  server: false,
});

const { appDay, setDate } = useDate();

const { data: user, isPending } = useConvexQuery(api.users.getCurrentUser, {});

const { total, totalToday, burn_rate, variance, currentPosition } =
  useExpenses();

const { windfallTotal } = useWindfall();

setDate(new Date());

const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {});

const left_to_spend = computed(() => {
  return 50 * 30 - (total.value ?? 0);
});
</script>

<template>
  <div>
    <div class="container mx-auto p-4 space-y-8">
      <div class="flex justify-between flex-wrap">
        <div>
          <div>
            {{ appDay }}
          </div>
        </div>
        <div>
          <div>
            {{ formatMoney(total ?? 0) }}<br />
            total spent
          </div>
          <div>
            {{ formatMoney(left_to_spend ?? 0) }}<br />
            left to spend
          </div>
        </div>
      </div>
      <app-main-card
        title="Budget Overview"
        subtitle="Your current budget status"
        :amount="currentPosition"
      >
        <template #items>
          <mini-card title="Spent Today" :amount="totalToday" />
          <mini-card title="Burn Rate" :amount="burn_rate" />
          <mini-card title="Variance" :amount="variance" />
          <mini-card title="Daily Budget" :amount="50" />
        </template>
        <template #actions>
          <div class="drawer drawer-end w-full">
            <input
              id="my-drawer-5"
              type="checkbox"
              class="drawer-toggle w-full"
            />
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
          <NuxtLink to="/today">Show todays Spending</NuxtLink>
        </template>
      </app-main-card>
      <div class="flex gap-4">
        <app-main-card
          class="basis-1/2"
          title="Windfall"
          :amount="windfallTotal"
        >
          <template #actions>
            <app-drawer title="windfall-drawer" label="Add Windfall">
              <windfall-add drawer-id="windfall-drawer" />
            </app-drawer>
            <NuxtLink to="/windfall">Show Windfall</NuxtLink>
          </template>
        </app-main-card>
        <app-main-card
          class="basis-1/2"
          title="Snowball"
          :amount="totalPayment"
        >
          <template #actions>
            <app-drawer title="snowball-drawer" label="Add Dept">
              <depts-add />
            </app-drawer>
            <NuxtLink to="/mydepts">Show Depts</NuxtLink>
          </template>
        </app-main-card>
      </div>
    </div>
  </div>
</template>
