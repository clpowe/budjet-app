import { api } from "../../convex/_generated/api";

export type AuthGateStatus = "loading" | "signed-out" | "needs-onboarding" | "ready";

type AuthGateState = {
  status: AuthGateStatus;
  sessionId: string | null;
};

let pendingResolution: Promise<AuthGateStatus> | null = null;

export const useAuthGate = () => {
  const authClient = useAuthClient();
  const convex = useConvexClient();
  const { $refreshConvexAuth } = useNuxtApp();

  const sessionState = authClient.useSession();

  const state = useState<AuthGateState>("budget-auth-gate", () => ({
    status: "loading",
    sessionId: null,
  }));

  const waitForSession = async () => {
    if (!sessionState.value.isPending) {
      return;
    }

    await new Promise<void>((resolve) => {
      const stop = watch(
        () => sessionState.value.isPending,
        (isPending) => {
          if (!isPending) {
            stop();
            resolve();
          }
        },
      );
    });
  };

  const resolveGate = async (force = false): Promise<AuthGateStatus> => {
    await waitForSession();

    const currentSessionId = sessionState.value.data?.session.id ?? null;

    if (!currentSessionId) {
      state.value = {
        status: "signed-out",
        sessionId: null,
      };

      return state.value.status;
    }

    if (!force && state.value.sessionId === currentSessionId && state.value.status !== "loading") {
      return state.value.status;
    }

    if (pendingResolution) {
      return pendingResolution;
    }

    pendingResolution = (async () => {
      let forceResolution = force;

      while (true) {
        await waitForSession();

        const sessionId = sessionState.value.data?.session.id ?? null;

        if (!sessionId) {
          state.value = {
            status: "signed-out",
            sessionId: null,
          };

          return state.value.status;
        }

        if (
          !forceResolution &&
          state.value.sessionId === sessionId &&
          state.value.status !== "loading"
        ) {
          return state.value.status;
        }

        state.value = {
          status: "loading",
          sessionId,
        };

        const isConvexAuthenticated = await $refreshConvexAuth();

        if (sessionState.value.data?.session.id !== sessionId) {
          forceResolution = true;
          continue;
        }

        if (!isConvexAuthenticated) {
          throw new Error("Unable to authenticate the current session with Convex.");
        }

        const household = await convex.query(api.households.getMyHousehold, {});

        if (sessionState.value.data?.session.id !== sessionId) {
          forceResolution = true;
          continue;
        }

        state.value = {
          status: household ? "ready" : "needs-onboarding",
          sessionId,
        };

        return state.value.status;
      }
    })().finally(() => {
      pendingResolution = null;
    });

    return pendingResolution;
  };

  const refresh = () => resolveGate(true);

  const invalidate = () => {
    state.value = {
      status: "loading",
      sessionId: null,
    };
  };

  return {
    state: readonly(state),
    status: computed(() => state.value.status),
    resolve: resolveGate,
    refresh,
    invalidate,
  };
};
