import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { normalizeSiteOrigin } from "./lib/auth-origin";

declare const process: {
  env: Record<string, string | undefined>;
};

const requireEnv = (name: "SITE_URL" | "CONVEX_SITE_URL" | "BETTER_AUTH_SECRET") => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = normalizeSiteOrigin(requireEnv("SITE_URL"));

  return betterAuth({
    appName: "Budget App",
    baseURL: requireEnv("CONVEX_SITE_URL"),
    secret: requireEnv("BETTER_AUTH_SECRET"),
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
};
