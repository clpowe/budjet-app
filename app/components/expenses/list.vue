<script setup lang="ts">
const { expenses, remove } = useExpenses();
import type { Doc } from "../../../convex/_generated/dataModel";

function onDelete(id: Doc<"expenses">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onExpenseUpdated(id: string) {
  closePopoverById(id);
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
      <tr v-for="item in expenses" :key="item._id">
        <td>{{ item.name }}</td>
        <td>{{ item.notes }}</td>
        <td>{{ formatMoney(item.amount) }}</td>
        <td>
          <button @click="onDelete(item._id)">Delete</button>
          <button :popovertarget="item._id">Edit</button>
          <div :id="item._id" popover>
            <lazy-expenses-edit :expense="item" @updated="onExpenseUpdated" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
