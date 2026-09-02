<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { data } = useConvexQuery(api.windfall.getMyWindfallTotal);
</script>

<template>
  <main class="l-page l-stack">
    <app-main-card title="Windfall" subtitle="One-off income and outflows" :amount="data">
      <template #actions>
        <app-drawer title="windfall-add" label="Add Windfall">
          <windfall-add drawer-id="windfall-add" />
        </app-drawer>
      </template>
    </app-main-card>

    <windfall-list />
  </main>
</template>
