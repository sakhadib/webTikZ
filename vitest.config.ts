import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/snapshots/**/*.test.ts"],
    coverage: { provider: "v8" },
  },
});
