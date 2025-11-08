<script setup lang="ts">
definePageMeta({
  middleware: ['onboarding-client'],
});
</script>
<template>
  <SignIn oauthFlow="redirect" redirect="/complete-profile" />
</template>
