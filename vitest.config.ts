import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reports: ["text", "html", "lcov"],
      reportsDirectory: "tests/coverage",
    },
  },
});
