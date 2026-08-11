<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

useHead({
  title: "Create account | Daily Funds",
  meta: [
    {
      name: "description",
      content: "Create a Daily Funds account and start organizing your household budget.",
    },
  ],
});
</script>

<template>
  <AuthCredentialsForm mode="sign-up" />
</template>
