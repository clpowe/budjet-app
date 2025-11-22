import { api } from '../../convex/_generated/api'
import { useConvexQuery } from '#imports'

export const useConvexUser = () => {
  const { data: user, suspense } = useConvexQuery(api.users.getCurrentUser, {})
  return { user, suspense }
}
