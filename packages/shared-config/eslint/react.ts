import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import type { Linter } from 'eslint';
import { baseConfig } from './base';

/**
 * React-specific ESLint configuration
 * Extends base configuration with React, React Hooks, and accessibility rules
 */
export const reactConfig = tseslint.config(
  ...baseConfig,

  // React configuration
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: true,
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        EventSource: 'readonly',
        WebSocket: 'readonly',
        crypto: 'readonly',
        indexedDB: 'readonly',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // React specific rules
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript for prop validation
      'react/jsx-uses-react': 'off', // Not needed with React 17+
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-pascal-case': 'error',
      'react/no-danger': 'error',
      'react/no-deprecated': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-find-dom-node': 'error',
      'react/no-is-mounted': 'error',
      'react/no-render-return-value': 'error',
      'react/no-string-refs': 'error',
      'react/no-unescaped-entities': 'error',
      'react/no-unknown-property': 'error',
      'react/require-render-return': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Accessibility rules (WCAG 2.2 AAA compliance)
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'error',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      // Keep accessibility rules as warnings (non-blocking)
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Test files configuration for React
  {
    files: ['**/*.test.tsx', '**/*.spec.tsx', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',

        // Browser globals for tests
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // Relaxed accessibility rules for tests only
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      // Disable rules requiring type information in test files
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
    },
  },

  // Temporary rule adjustments for gradual migration
  {
    files: ['**/*.tsx', '**/*.ts'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Temporarily disable strict type checking rules for gradual fixing
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Disable security rules that are often false positives
      'security/detect-object-injection': 'off',
      // Temporarily disable rules that can be fixed gradually
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      'no-void': 'off',
      radix: 'off',
      'security/detect-unsafe-regex': 'off',
    },
  }
) satisfies Linter.Config[];

export default reactConfig;
