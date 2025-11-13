<script setup lang="ts">
import type { ColumnDef, Row } from '@tanstack/vue-table'

const toast = useToast()
const overlay = useOverlay()
const { selectedMonth } = useMonthNavigation();

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import SpendingEditSlideover from './edit-slideover.vue'

const { data: spending } = useConvexQuery(
  api.spending.getToday,
  computed(() => ({ month: selectedMonth.value }))
)

const { mutate: deleteSpending } = useConvexMutation(api.spending.deleteSpending)

const editSlideover = overlay.create(SpendingEditSlideover, {
  destroyOnClose: true
})

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const columns: ColumnDef<Doc<'spending'>> = [
  {
    accessorKey: 'name',
    header: 'Name',
    meta: {
      class: {
        th: 'text-center font-semibold',
        td: 'text-center font-mono'
      }
    }
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
  },
  {
    accessorKey: 'value',
    header: 'Value',
    cell: ({ row }) => {
      return formatMoney(row.getValue('value'))
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end'
            },
            items: getRowItems(row),
            'aria-label': 'Actions dropdown'
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto',
              'aria-label': 'Actions dropdown'
            })
        )
      )
    }
  }
]

function getRowItems(row: Row<Doc<'spending'>>) {
  return [
    {
      type: 'label',
      label: 'Actions'
    },
    {
      label: 'Delete',
      onSelect() {

        deleteSpending({
          spendingId: row.original._id
        })

        toast.add({
          title: 'Deleted spending!',
          color: 'success',
          icon: 'i-lucide-circle-check'
        })
      }
    },
    {
      label: 'Edit',
      onSelect() {
        openEditSlideover(row.original)
      }
    }
  ]
}

async function openEditSlideover(item: Doc<'spending'>) {
  const instance = editSlideover.open({
    spending: item
  })

  const updatedId = await instance
  if (updatedId) {
    toast.add({
      title: 'Updated spending!',
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
  }
}
</script>

<template>
  <UTable :data="spending" :columns="columns" class="flex-1" />
</template>

<style scoped>
.transaction {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 10ch;
}
</style>
