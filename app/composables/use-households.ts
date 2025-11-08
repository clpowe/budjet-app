// composables/useHousehold.ts
import { api } from "../../convex/_generated/api";

export const useHousehold = () => {
  const convex = useConvexClient();
  const user = useAuth();

  // Sync user with Convex when they sign in
  const syncUser = async () => {
    if (!user.userId.value) return;
    const u = await convex.mutation(api.users.syncUser, {
      clerkId: user.userId.value,
      email: "",
      name: user.sessionId.value!,
    });
    console.log(u)
  };

  // Get current user's household
  const household = convex.query(api.households.getMyHousehold, {});

  // Get household members
  const members = convex.query(api.households.getHouseholdMembers, {});

  // Create a new household
  const createHousehold = async (name: string) => {
    try {
      await syncUser();
      const householdId = await convex.mutation(api.households.createHousehold, {
        name,
      });
      return { success: true, householdId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  // Join existing household
  const joinHousehold = async (inviteCode: string) => {
    try {
      await syncUser();
      const householdId = await convex.mutation(api.households.joinHousehold, {
        inviteCode,
      });
      return { success: true, householdId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  // Leave household
  const leaveHousehold = async () => {
    try {
      await convex.mutation(api.households.leaveHousehold, {});
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return {
    household,
    members,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    syncUser,
  };
};
