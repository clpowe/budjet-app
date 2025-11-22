<script setup lang="ts">
const { windfall, remove } = useWindfall();
import type { Doc } from "../../../convex/_generated/dataModel";

function onDelete(id: Doc<"windfall">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onWindfallUpdated(id: string) {
  closePopoverById(id);

}</script>

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
      <tr v-for="item in windfall" :key="item._id">
        <td>{{ item.source }}</td>
        <td>{{ item.notes }}</td>
        <td>{{ formatMoney(item.amount) }}</td>
        <td>
          <button @click="onDelete(item._id)">Delete</button>
          <button :popovertarget="item._id">Edit</button>
          <div :id="item._id" popover>
            <lazy-windfall-edit :windfall="item" @updated="onWindfallUpdated" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
