import { describe, expect, it } from "vite-plus/test";
import { normalizeSiteOrigin } from "../../convex/lib/auth_origin";

describe("normalizeSiteOrigin", () => {
  it("removes a trailing slash so CORS matches the browser Origin header", () => {
    expect(normalizeSiteOrigin("https://budget-app.clpowe.workers.dev/")).toBe(
      "https://budget-app.clpowe.workers.dev",
    );
  });

  it("reduces configured URLs to their origin", () => {
    expect(normalizeSiteOrigin("https://example.com/auth?source=production")).toBe(
      "https://example.com",
    );
  });
});
