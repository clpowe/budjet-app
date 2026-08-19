// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";
import type { NuxtConfig, ViteOptions } from "nuxt/schema";
import { fileURLToPath } from "url";

const convexUrls = {
  development: "https://hip-caribou-985.convex.cloud",
  production: "https://tidy-fox-761.convex.cloud",
} as const;

type NuxtConfigWithEnvironments = NuxtConfig & {
  $development?: { convex: { url: string } };
  $production?: { convex: { url: string } };
};

const vite = {
  plugins: tailwindcss(),
} as ViteOptions;

export default {
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: true },
  experimental: {
    viteEnvironmentApi: true,
  },
  modules: ["convex-nuxt", "@nuxt/icon", "nitro-cloudflare-dev"],

  vite,
  alias: {
    "@generated": fileURLToPath(new URL("./convex/_generated/", import.meta.url)),
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
      url: convexUrls.development,
    },
  },

  $production: {
    convex: {
      url: convexUrls.production,
    },
  },

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
} satisfies NuxtConfigWithEnvironments;
