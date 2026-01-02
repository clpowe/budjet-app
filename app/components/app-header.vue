<script setup lang="ts"></script>

<template>
  <header class="flex justify-between">
    <div class="flex gap-4">
      <NuxtLink to="/home"> Home </NuxtLink>
      <NuxtLink to="/monthly"> Monthly </NuxtLink>
    </div>
    <div>
      <ClientOnly>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </ClientOnly>
      <input type="checkbox" value="light" class="toggle theme-controller" />
    </div>
  </header>
</template>
