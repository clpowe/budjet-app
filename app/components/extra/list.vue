<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const { data: spending } = useConvexQuery(api.extraDollars.getExtraDollars);

const { mutate: deleteExtraDollars } = useConvexMutation(api.extraDollars.deleteExtraDollars);

function onDelete(id: Doc<"extraDollars">["_id"]) {
  deleteExtraDollars({ extraDollarId: id });
}
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Notes</th>
        <th>Value</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in spending" :key="item._id">
        <td>{{ item.name }}</td>
        <td>{{ item.notes }}</td>
        <td>{{ formatMoney(item.value) }}</td>
        <td>
          <button @click="onDelete(item._id)">Delete</button>
          <!-- <NuxtLink :to="`/extra/${item._id}/edit`">Edit</NuxtLink> -->
        </td>
      </tr>
    </tbody>
  </table>
</template>