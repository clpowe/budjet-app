import { api } from "../../convex/_generated/api";

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "An unexpected error occurred";
};

export const useHousehold = () => {
  const convex = useConvexClient();
  const authGate = useAuthGate();

  // Sync user with Convex when they sign in
  const syncUser = async () => {
    return await convex.mutation(api.users.syncUser, {});
  };

  // Get current user's household
  const { data: household } = useConvexQuery(api.households.getMyHousehold, {});

  // Get household members
  const { data: members } = useConvexQuery(api.households.listHouseholdMembers, {});

  // Create a new household
  const createHousehold = async (name: string) => {
    try {
      await syncUser();

      const householdId = await convex.mutation(api.households.createHousehold, {
        name,
      });

      authGate.invalidate();

      return { success: true, householdId };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) };
    }
  };

  // Join existing household
  const joinHousehold = async (inviteCode: string) => {
    try {
      await syncUser();
      const householdId = await convex.mutation(api.households.updateHouseholdMembers, {
        inviteCode,
      });

      authGate.invalidate();

      return { success: true, householdId };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) };
    }
  };

  // Leave household
  const leaveHousehold = async () => {
    try {
      await convex.mutation(api.households.updateHouseholdMembership, {});

      authGate.invalidate();
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
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
