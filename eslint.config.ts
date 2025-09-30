import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "data",
      "coverage",
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
    rules: {
      // Keep iteration-friendly defaults in src
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Relax stricter stylistic rules to reduce noise
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/prefer-function-type": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-function": "warn",
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
      // Tests often use flexible data and empty stubs
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/array-type": "off",
    },
  },
);
