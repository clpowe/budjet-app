import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";
import type { AuthGateStatus } from "~/composables/use-auth-gate";

const publicRoutes = new Set(["/", "/auth/sign-in", "/auth/sign-up"]);
const onboardingRoute = "/onboarding";
const homeRoute = "/home";

type Status = Exclude<AuthGateStatus, "loading">;

type RouteKind = "onboarding" | "public" | "protected";

const routeKind = (path: string): RouteKind =>
  path === onboardingRoute ? "onboarding" : publicRoutes.has(path) ? "public" : "protected";

type Outcome = { kind: "allow" } | { kind: "redirect"; to: RouteLocationRaw };

const allow = { kind: "allow" } as const;
const go = (to: RouteLocationRaw): Outcome => ({ kind: "redirect", to });
const signIn = (r: RouteLocationNormalized) =>
  go({ path: "/auth/sign-in", query: { redirect: r.fullPath } });

const table: Record<Status, Record<RouteKind, (r: RouteLocationNormalized) => Outcome>> = {
  "signed-out": {
    onboarding: signIn,
    public: () => allow,
    protected: signIn,
  },
  "needs-onboarding": {
    onboarding: () => allow,
    public: () => go(onboardingRoute),
    protected: () => go(onboardingRoute),
  },
  ready: {
    onboarding: () => go(homeRoute),
    public: (route) => go(getSafeAuthRedirect(route.query.redirect) ?? homeRoute),
    protected: () => allow,
  },
};

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const status = await useAuthGate().resolve();
  if (status === "loading") {
    throw new Error("The auth gate resolved without reaching a terminal status.");
  }

  const outcome = table[status][routeKind(to.path)](to);

  if (outcome.kind === "redirect") {
    return navigateTo(outcome.to, { replace: true });
  }
});
