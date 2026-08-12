import { describe, expect, it } from "vite-plus/test";
import { getSafeAuthRedirect } from "../../app/utils/auth-redirects";

describe("getSafeAuthRedirect", () => {
  it("preserves safe internal destinations", () => {
    expect(getSafeAuthRedirect("/monthly?month=2026-08#transactions")).toBe(
      "/monthly?month=2026-08#transactions",
    );
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "monthly",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/",
    "/auth/sign-in",
    "/auth/sign-up",
    "/onboarding",
    "/auth/sign-in?redirect=/home",
  ])("rejects unsafe or blocked destination %j", (destination) => {
    expect(getSafeAuthRedirect(destination)).toBeNull();
  });
});
