import type { AuthTokenFetcher } from "convex/browser";
import { createBudgetAuthClient } from "~/lib/auth-client";

type ConvexAuthStatus = "loading" | "authenticated" | "unauthenticated";

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.convexSiteUrl as unknown as string;

  if (!baseURL) {
    throw new Error("Missing NUXT_PUBLIC_CONVEX_SITE_URL");
  }

  const authClient = createBudgetAuthClient(baseURL);
  const sessionState = authClient.useSession();

  const currentUrl = new URL(window.location.href);
  const oneTimeToken = currentUrl.searchParams.get("ott");

  if (oneTimeToken) {
    currentUrl.searchParams.delete("ott");
    window.history.replaceState(window.history.state, "", currentUrl);

    const result = await authClient.crossDomain.oneTimeToken.verify({
      token: oneTimeToken,
    });

    const session = result.data?.session;

    if (session) {
      await authClient.getSession({
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      });

      await sessionState.value.refetch();
    }
  }

  const convex = useConvexClient();

  const convexAuthStatus = useState<ConvexAuthStatus>("convex-auth-status", () => "loading");

  let cachedToken: string | null = null;
  let pendingToken: Promise<string | null> | null = null;
  let authRefreshQueue = Promise.resolve(false);

  const fetchToken: AuthTokenFetcher = async ({ forceRefreshToken }) => {
    if (cachedToken && !forceRefreshToken) {
      return cachedToken;
    }

    if (pendingToken) {
      return pendingToken;
    }

    pendingToken = authClient.convex
      .token({
        fetchOptions: {
          throw: false,
        },
      })
      .then(({ data }) => {
        cachedToken = data?.token ?? null;
        return cachedToken;
      })
      .catch(() => {
        cachedToken = null;
        return null;
      })
      .finally(() => {
        pendingToken = null;
      });

    return pendingToken;
  };

  const refreshConvexAuth = () => {
    authRefreshQueue = authRefreshQueue
      .catch(() => false)
      .then(() => {
        cachedToken = null;
        convexAuthStatus.value = "loading";

        return new Promise<boolean>((resolve) => {
          let settled = false;

          convex.setAuth(fetchToken, (isAuthenticated) => {
            convexAuthStatus.value = isAuthenticated ? "authenticated" : "unauthenticated";

            if (!settled) {
              settled = true;
              resolve(isAuthenticated);
            }
          });
        });
      });

    return authRefreshQueue;
  };

  void refreshConvexAuth();

  watch(
    () => sessionState.value.data?.session.id,
    () => {
      void refreshConvexAuth();
    },
    {
      flush: "sync",
    },
  );

  return {
    provide: {
      authClient,
      refreshConvexAuth,
    },
  };
});
