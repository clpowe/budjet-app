<template>
  <UHeader>
    <template #left>
      <NuxtLink to="/home">
        Home
      </NuxtLink>
    </template>

    <template #right>
      <UColorModeSwitch />
      <ClientOnly>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </ClientOnly>
    </template>
  </UHeader>
</template>
