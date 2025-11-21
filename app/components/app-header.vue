<template>
  <header>
    <NuxtLink to="/home">
      Home
    </NuxtLink>

    <ClientOnly>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </ClientOnly>
  </header>
</template>