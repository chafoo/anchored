/**
 * ESLint flat config — modern format (ESLint 9+).
 *
 * Rules layered:
 *   - typescript-eslint strict + stylistic
 *   - project-specific rules below (anchored conventions)
 *
 * Run via `npm run lint`; auto-fix via `npm run lint:fix`.
 * Pre-commit hook narrows to staged files (see lint-staged in package.json).
 */

import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // anchored project-specific
      'no-console': ['warn', { allow: ['error'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Allow non-null-assertion for tests + clear-intent code
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Service-layer ops throw typed errors — bare `throw new Error(...)` is a smell
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'NewExpression[callee.name="Error"]',
          message:
            'Prefer typed service-layer errors (InvalidTransition, NotFound, IncompleteEvidence, etc.) over bare `new Error()` — they carry recovery suggestions for CLI + MCP surfaces.',
        },
      ],
    },
  },
  {
    // Tests are allowed more flexibility
    files: ['tests/**/*.ts', 'tests/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  {
    // Build scripts run outside the strict src/ contract
    files: ['scripts/**/*', 'build.mjs', 'eslint.config.js'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Ignore generated output + dependencies
    ignores: ['dist/**', 'dist-schemas/**', 'node_modules/**', 'coverage/**'],
  },
);
