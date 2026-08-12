// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: true },
  experimental: {
    viteEnvironmentApi: true,
  },
  modules: ["convex-nuxt", "@nuxt/icon", "nitro-cloudflare-dev"],

  vite: {
    plugins: [tailwindcss()],
  },

  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    convexDeployment: "",
    public: {
      convexUrl: "",
      convexSiteUrl: "",
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

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
});
