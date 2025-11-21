<script setup lang="ts">
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const { queryDayBounds, } = useDate()
const { user } = useConvexUser()


const { data: spending } = useConvexQuery(
  api.expenses.listMyExpenses,
  computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
    householdId: user?.value?.householdId
  }))
);

const { mutate: deleteSpending } = useConvexMutation(api.expenses.deleteExpense);

function onDelete(id: Doc<"expenses">["_id"]) {
  deleteSpending({ expenseId: id });
}

function onExpenseUpdated(id: string) {
  const popover = document.getElementById(id);
  console.log(popover)
  if (popover) {
    popover.hidePopover();
  }
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
        <td>{{ formatMoney(item.amount) }}</td>
        <td>
          <button @click="onDelete(item._id)">Delete</button>
          <button :popovertarget="item._id">Edit</button>
          <div :id="item._id" popover>
            <LazySpendingEdit :expense="item" @updated="onExpenseUpdated" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
