import { api } from "../../convex/_generated/api";
import { computed, watch } from "vue";

export const DEFAULT_HOUSEHOLD_TIME_ZONE = "America/New_York";

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "An unexpected error occurred";
};

export const useHousehold = () => {
  const convex = useConvexClient();
  const authGate = useAuthGate();
  const timeZoneNow = useState<number>("household-time-zone-now", () => Date.now());
  const { data: household } = useConvexQuery(api.households.getMyHousehold, {});
  const { data: members } = useConvexQuery(api.households.listHouseholdMembers, {});

  watch(
    () => household.value?.pendingTimeZoneEffectiveAt,
    (effectiveAt) => {
      timeZoneNow.value = Date.now();

      if (typeof effectiveAt !== "number" || effectiveAt <= timeZoneNow.value) {
        return;
      }

      setTimeout(
        () => {
          timeZoneNow.value = Date.now();
        },
        effectiveAt - timeZoneNow.value + 1,
      );
    },
    { immediate: true },
  );

  const effectiveTimeZone = computed(() => {
    const currentHousehold = household.value;

    if (
      currentHousehold?.pendingTimeZone &&
      currentHousehold.pendingTimeZoneEffectiveAt !== undefined &&
      timeZoneNow.value >= currentHousehold.pendingTimeZoneEffectiveAt
    ) {
      return currentHousehold.pendingTimeZone;
    }

    return currentHousehold?.timeZone ?? DEFAULT_HOUSEHOLD_TIME_ZONE;
  });

  // Sync user with Convex when they sign in
  const syncUser = async () => {
    return await convex.mutation(api.users.syncUser, {});
  };

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

  const updateTimeZone = async (timeZone: string) => {
    try {
      const result = await convex.mutation(api.households.updateTimeZone, {
        timeZone,
      });

      return { success: true as const, ...result };
    } catch (error: unknown) {
      return { success: false as const, error: getErrorMessage(error) };
    }
  };

  return {
    household,
    members,
    effectiveTimeZone,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    updateTimeZone,
    syncUser,
  };
};
