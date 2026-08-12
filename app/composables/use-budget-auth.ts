import { api } from "../../convex/_generated/api";
import { useAuthClient } from "./use-auth-client";

type Credentials = {
  email: string;
  password: string;
};

type SignUpCredentials = Credentials & {
  name: string;
};

type AuthActionResult = { success: true } | { success: false; error: string };

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error != null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
};

export const useBudgetAuth = () => {
  const authClient = useAuthClient();
  const authGate = useAuthGate();
  const convex = useConvexClient();
  const { $refreshConvexAuth } = useNuxtApp();

  const sessionState = authClient.useSession();

  const session = computed(() => sessionState.value.data);
  const user = computed(() => session.value?.user ?? null);
  const isPending = computed(() => sessionState.value.isPending);
  const isAuthenticated = computed(() => Boolean(session.value?.session));

  const refreshAuthenticatedSession = async () => {
    await sessionState.value.refetch();

    if (!sessionState.value.data?.session) {
      throw new Error("Unable to load the authenticated session.");
    }

    const isConvexAuthenticated = await $refreshConvexAuth();

    if (!isConvexAuthenticated) {
      throw new Error("Unable to authenticate the current session with Convex.");
    }
  };

  const syncUser = async () => {
    await convex.mutation(api.users.syncUser, {});
  };

  const finishAuthentication = async () => {
    await refreshAuthenticatedSession();
    await syncUser();
    await authGate.refresh();
  };

  const signIn = async (credentials: Credentials): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signIn.email({
        email: credentials.email,
        password: credentials.password,
        rememberMe: true,
      });

      if (result.error) {
        return {
          success: false,
          error: getErrorMessage(result.error),
        };
      }

      await finishAuthentication();

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  };

  const signUp = async (credentials: SignUpCredentials): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signUp.email({
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
      });

      if (result.error) {
        return {
          success: false,
          error: getErrorMessage(result.error),
        };
      }

      await finishAuthentication();

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  };

  const signOut = async (): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signOut();

      if (result.error) {
        return {
          success: false,
          error: getErrorMessage(result.error),
        };
      }

      authGate.invalidate();

      await sessionState.value.refetch();

      const isStillConvexAuthenticated = await $refreshConvexAuth();

      if (isStillConvexAuthenticated) {
        throw new Error("Unable to clear the Convex authentication state.");
      }

      const status = await authGate.resolve();

      if (status !== "signed-out") {
        throw new Error("Unable to clear the authenticated session.");
      }

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  };

  return {
    session,
    user,
    isPending,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
  };
};
