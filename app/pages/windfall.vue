<script setup lang="ts">
import { api } from "../../convex/_generated/api";

const { data } = useConvexQuery(api.windfall.getMyWindfallTotal);

definePageMeta({
  middleware: ["auth"],
});
</script>

<template>
  <div class="px-4 container mx-auto space-y-8">
    <app-main-card title="Windfall" subtitle="One-off income and outflows" :amount="data">
      <template #actions>
        <app-drawer title="windfall-add" label="Add Windfall">
          <windfall-add drawer-id="windfall-add" />
        </app-drawer>
      </template>
    </app-main-card>

    <windfall-list />
  </div>
</template>
