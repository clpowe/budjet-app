<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

useHead({
  title: "Sign in | Daily Funds",
  meta: [
    {
      name: "description",
      content: "Sign in to Daily Funds to manage your household budget.",
    },
  ],
});
</script>

<template>
  <AuthCredentialsForm mode="sign-in" />
</template>
