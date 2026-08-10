import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["convex/_generated/**"],
  },
  lint: {
    ignorePatterns: ["convex/_generated/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
