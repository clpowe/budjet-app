<script setup lang="ts">
const { depts, update } = useDepts()
import type { Id } from "../../../convex/_generated/dataModel";



async function handleupdate(id: Id<"debts">, value: boolean) {
  if (!id) return
  await update({ id, isPriority: !value })
}
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Creditor</th>
        <th>In Snowball</th>
        <th>Payment</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in depts" :key="item._id">
        <td>{{ item.creditor }}</td>
        <td>
          <button @click="handleupdate(item._id, item.isPriority)">
            {{ item.isPriority ? 'Remove' : 'Add' }}
          </button>
        </td>
        <td>{{ formatMoney(item.payment) }}</td>
        <td>
          <button :popovertarget="item._id">Edit</button>
          <div :id="item._id" popover>
            <lazy-depts-edit :depts="item" @updated="handleupdate" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
