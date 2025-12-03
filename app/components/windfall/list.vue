<script setup lang="ts">
const { windfall, remove } = useWindfall();
import type { Doc } from "../../../convex/_generated/dataModel";

function onDelete(id: Doc<"windfall">["_id"]) {
  remove(id);
}

const { closePopoverById } = usePopoverClose();

function onWindfallUpdated(id: string) {
  closePopoverById(id);
}

const windfallSplit = computed(() => {
  if (!windfall.value) {
    return { income: [], expense: [] };
  }
  return Object.groupBy(windfall.value, ({ amount }) =>
    amount > 0 ? "income" : "expense",
  );
});
</script>

<template>
  <div class="tables">
    <div v-for="(items, key) in windfallSplit">
      {{ key }}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item._id">
            <td>{{ item.source }}</td>
            <td>{{ formatMoney(item.amount) }}</td>
            <td>
              <button @click="onDelete(item._id)">Delete</button>
              <button :popovertarget="item._id">Edit</button>
              <div :id="item._id" popover>
                <lazy-windfall-edit
                  :windfall="item"
                  @updated="onWindfallUpdated"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tables {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
}

tr {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
}
</style>
