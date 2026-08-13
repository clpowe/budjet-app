// @ts-ignore The unit test runtime provides Node built-ins; the app tsconfig omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("Cloudflare deployment configuration", () => {
  it("provides the production Convex site URL to Nuxt runtime config", () => {
    const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

    expect(config).toMatch(
      /"NUXT_PUBLIC_CONVEX_SITE_URL"\s*:\s*"https:\/\/tidy-fox-761\.convex\.site"/,
    );
  });
});
