module.exports = {
  root: true,
  env: {
    es2023: true,
    node: true,
  },
  ignorePatterns: [
    'dist/',
    'data/',
    'node_modules/',
    'coverage/',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  overrides: [
    {
      files: ['**/*.ts'],
      extends: [
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        // So we can iterate without being blocked by typing decisions
        '@typescript-eslint/no-explicit-any': 'warn',
        // Allow unused variables prefixed with _ and avoid noise on rest siblings
        '@typescript-eslint/no-unused-vars': ['warn', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        }],
      },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        // Tests often use flexible data
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        }],
      },
    },
  ],
};
