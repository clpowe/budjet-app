<script setup lang="ts"></script>

<template>
  <header class="flex justify-between">
    <NuxtLink to="/home"> Home </NuxtLink>
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
