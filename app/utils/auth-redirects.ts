const blockedRedirectPaths = new Set(["/", "/auth/sign-in", "/auth/sign-up", "/onboarding"]);

export const getSafeAuthRedirect = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);

    if (url.origin !== window.location.origin || blockedRedirectPaths.has(url.pathname)) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};
