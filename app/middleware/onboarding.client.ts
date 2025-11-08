const publicPages = createRouteMatcher([
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/complete-profile'])

export default defineNuxtRouteMiddleware(async (to) => {
  const { isSignedIn, sessionClaims } = useAuth()

  if (!isSignedIn.value && publicPages(to)) {
    return navigateTo('/auth/sign-in');
  }

})
