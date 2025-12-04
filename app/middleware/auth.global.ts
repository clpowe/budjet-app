const publicRoutes = createRouteMatcher([
  "/",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/complete-profile",
]);

const onboardingRoute = "/onboarding";
const homeRoute = "/home";

export default defineNuxtRouteMiddleware((to) => {
  // Clerk composables are client-only; skip during SSR.
  if (import.meta.server) return;

  const { isLoaded, isSignedIn, sessionClaims } = useAuth();

  // Wait for Clerk to hydrate before making decisions.
  if (!isLoaded.value) return;

  // Let public pages render; optionally fast-forward authenticated users off landing.
  if (publicRoutes(to)) {
    if (isSignedIn.value && to.path === "/") {
      return navigateTo(homeRoute);
    }
    return;
  }

  // Protect everything else.
  if (!isSignedIn.value) {
    return navigateTo("/auth/sign-in");
  }

  const profileComplete =
    (sessionClaims.value?.unsafeMetadata as Record<string, unknown> | null)
      ?.profileComplete === true;

  const { isComplete, loading } = useProfileStatus();

  // Treat either Clerk metadata or backend household as completion.
  const complete = profileComplete || (isComplete.value && !loading.value);

  // Force onboarding until complete (only when we know status).
  if (!complete && !loading.value && to.path !== onboardingRoute) {
    return navigateTo(onboardingRoute);
  }

  // Keep completed users off onboarding page.
  if (complete && to.path === onboardingRoute) {
    return navigateTo(homeRoute);
  }
});
