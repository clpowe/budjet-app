// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: true },
  modules: [
    "@nuxt/test-utils/module",
    "@nuxt/test-utils",
    "convex-nuxt",
    "@clerk/nuxt",
    "@nuxthub/core",
    "@nuxt/icon",
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    // server only
    clerkSecretKey: "",
    convexDeployment: "",
    public: {
      clerkPublishableKey: "",
      convexUrl: "",
    },
  },
  $development: {
    convex: {
      url: "https://hip-caribou-985.convex.cloud",
    },
  },
  $production: {
    convex: {
      url: "https://tidy-fox-761.convex.cloud",
    },
  },
});
