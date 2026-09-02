<script setup lang="ts">
defineProps<{
  label: string;
  title: string;
}>();

const dialog = shallowRef<HTMLDialogElement | null>(null);

function open() {
  dialog.value?.showModal();
}
</script>

<template>
  <button type="button" @click="open">{{ label }}</button>

  <dialog :id="title" ref="dialog">
    <header class="l-cluster l-split">
      <h2>{{ label }}</h2>
      <form method="dialog">
        <button type="submit">Close</button>
      </form>
    </header>
    <slot />
  </dialog>
</template>
