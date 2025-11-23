<script setup lang="ts">
const { depts, totalPayment } = useDepts()
import type { Id } from "../../../convex/_generated/dataModel";



async function handleSnowball(id: Id<"snowball">, value: boolean) {
  if (!id) return
  await update({ id, value: !value })
}
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Creditor</th>
        <th>Notes</th>
        <th>Payment</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in depts" :key="item._id">
        <td>{{ item.creditor }}</td>
        <td>{{ item.isPriority }}</td>
        <td>{{ formatMoney(item.payment) }}</td>
        <td>
          <button :popovertarget="item._id">Edit</button>
          <div :id="item._id" popover>
            <lazy-dept-edit :windfall="item" @updated="onWindfallUpdated" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
