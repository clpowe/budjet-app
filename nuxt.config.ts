// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxt/test-utils',
    'convex-nuxt',
    '@clerk/nuxt',
    '@nuxthub/core'
  ],
  runtimeConfig: {
    // server only
    clerkSecretKey: '',
    convexDeployment: '',

    public: {
      clerkPublishableKey: '',
      convexUrl: '',
    }
  },
  $development: {
    convex: {
      url: 'https://hip-caribou-985.convex.cloud',
    },
  },
  $production: {
    convex: {
      url: 'https://tidy-fox-761.convex.cloud',
    },
  }
})

