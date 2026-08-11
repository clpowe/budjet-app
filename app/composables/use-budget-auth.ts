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
  const convex = useConvexClient();
  const sessionState = authClient.useSession();

  const session = computed(() => sessionState.value.data);
  const user = computed(() => session.value?.user ?? null);
  const isPending = computed(() => sessionState.value.isPending);
  const isAuthenticated = computed(() => Boolean(session.value?.session));

  const refreshSession = async () => {
    await authClient.getSession();
    await authClient.updateSession();

    // Allow the token bridge's session watcher to refresh Convex authentication.
    await nextTick();
  };

  const syncUser = async () => {
    await convex.mutation(api.users.syncUser, {});
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

      await refreshSession();
      await syncUser();

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

      await refreshSession();
      await syncUser();

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

      await authClient.updateSession();

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
