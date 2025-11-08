import { api } from "../../convex/_generated/api";

export const useConvexUser = () => {
  const convex = useConvexClient();
  const user = convex.query(api.users.getCurrentUser, {});
  const household = convex.query(api.households.getMyHousehold, {});
  return {
    user,
    household
  }
}
