<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { data } = useConvexQuery(api.income.getMyIncomeTotal, {});
const totalDollars = computed(() =>
  data.value === undefined ? undefined : Number(data.value) / 100,
);
</script>

<template>
  <main class="l-page l-stack">
    <app-main-card title="Windfall" subtitle="One-off income and outflows" :amount="totalDollars">
      <template #actions>
        <app-drawer title="windfall-add" label="Add Windfall">
          <windfall-add drawer-id="windfall-add" />
        </app-drawer>
      </template>
    </app-main-card>

    <windfall-list />
  </main>
</template>
