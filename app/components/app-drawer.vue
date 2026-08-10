<script setup lang="ts">
defineProps<{
  label: string;
  title: string;
}>();
</script>

<template>
  <div class="drawer drawer-end w-full">
    <input :id="title" type="checkbox" class="drawer-toggle w-full" />
    <div class="drawer-content">
      <label :for="title" class="drawer-button btn btn-primary">
        {{ label }}
      </label>
    </div>
    <div class="drawer-side">
      <label :for="title" aria-label="close sidebar" class="drawer-overlay"></label>
      <div class="menu bg-base-200 min-h-full w-80 p-4">
        <slot />
      </div>
    </div>
  </div>
</template>
