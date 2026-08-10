import type { AuthTokenFetcher } from "convex/browser";
import { createBudgetAuthClient } from "~/lib/auth-client";

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig();
  const baseURL = config.public.convexSiteUrl as unknown as string;

  if (!baseURL) {
    throw new Error("Missing NUXT_PUBLIC_CONVEX_SITE_URL");
  }

  const authClient = createBudgetAuthClient(baseURL);

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

      await authClient.updateSession();
    }
  }

  const convex = useConvexClient();
  const sessionState = authClient.useSession();

  let cachedToken: string | null = null;
  let pendingToken: Promise<string | null> | null = null;

  const fetchToken: AuthTokenFetcher = async ({ forceRefreshToken }) => {
    if (cachedToken && !forceRefreshToken) {
      return cachedToken;
    }

    if (pendingToken && !forceRefreshToken) {
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

  convex.setAuth(fetchToken);

  watch(
    () => sessionState.value.data?.session.id,
    () => {
      cachedToken = null;
      convex.setAuth(fetchToken);
    },
  );

  return {
    provide: {
      authClient,
    },
  };
});
