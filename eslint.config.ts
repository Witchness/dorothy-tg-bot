import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "tests/_coverage",
      "pnpm-lock.yaml",
      "*.md",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    extends: [
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["tests/**/*.ts"],
    extends: [
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
    ],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
