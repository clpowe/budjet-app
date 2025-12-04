import { api } from "../../convex/_generated/api";

type ProfileState = {
  isComplete: boolean;
  loading: boolean;
};

/**
 * Cached profile completion status based on backend data.
 * Treats presence of a household as "profile complete".
 */
export const useProfileStatus = () => {
  const state = useState<ProfileState>("profile-status", () => ({
    isComplete: false,
    loading: true,
  }));

  const { data: household } = useConvexQuery(api.households.getMyHousehold, {});

  watchEffect(() => {
    if (household.value === undefined) return;
    state.value = {
      isComplete: Boolean(household.value),
      loading: false,
    };
  });

  return {
    isComplete: computed(() => state.value.isComplete),
    loading: computed(() => state.value.loading),
  };
};
