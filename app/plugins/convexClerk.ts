export default defineNuxtPlugin(() => {
  const convex = useConvexClient() // from convex-nuxt
  const auth = useAuth() // from @clerk/nuxt

  // Whenever Convex needs a token, it will call this function
  const getToken = async () => {
    return auth.getToken.value({
      template: 'convex',
      skipCache: false,
    })
  }

  convex.setAuth(getToken)
})
