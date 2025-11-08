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
  convex: {
    url: process.env.CONVEX_URL,
  },
  alias: {
    "#convex": "/<rootDir>/convex",
  }
})