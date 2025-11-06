import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import type { Linter } from 'eslint';

/**
 * Base ESLint configuration for TypeScript projects
 * Provides strict type checking, security rules, and best practices
 */
export const baseConfig = tseslint.config(
  // Base JavaScript recommended rules
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // TypeScript configuration with recommended rules
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),

  // Security plugin configuration
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,

      // Enhanced security rules
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',

      // Additional built-in security rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-iterator': 'error',
      'no-caller': 'error',
      'no-extend-native': 'error',
      'no-global-assign': 'error',
      'no-implicit-globals': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-void': 'error',
      'no-with': 'error',
      radix: 'error',
      'wrap-iife': ['error', 'inside'],
      yoda: 'error',
    },
  },

  // TypeScript-specific rules for source code
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        project: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Enhanced TypeScript rules for security and best practices
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off', // Too strict for general use
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Override base rules that conflict with TypeScript
      'no-unused-vars': 'off',
      'no-undef': 'off', // TypeScript handles this

      // General best practices
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // Test files configuration - relaxed rules
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      // Relaxed TypeScript rules for tests
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // General rules for tests
      'no-console': 'off', // Allow console in tests
      'security/detect-object-injection': 'off',
      'no-script-url': 'warn',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.d.ts',
      '**/*.js.map',
      '.kiro/**',
    ],
  }
) satisfies Linter.Config[];

export default baseConfig;
