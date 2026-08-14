import { defineConfig, type TestProjectConfiguration } from "vite-plus";
import { defineVitestProject } from "@nuxt/test-utils/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/{e2e,unit}/*.{test,spec}.ts", "tests/{e2e,unit}/*.{test,spec}.ts"],
          environment: "node",
        },
      },
      defineVitestProject({
        test: {
          name: "nuxt",
          include: ["test/nuxt/*.{test,spec}.ts", "tests/nuxt/*.{test,spec}.ts"],
          environment: "nuxt",
        },
      }) as unknown as TestProjectConfiguration,
      {
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
        },
      },
    ],
  },
});
