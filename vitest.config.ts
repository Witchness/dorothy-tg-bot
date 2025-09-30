import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "tests/_coverage",
      exclude: [
        "tests/**",
        "scripts/**",
        "data/**",
        "dist/**",
        "src/index.ts",
      ],
    },
  },
});
