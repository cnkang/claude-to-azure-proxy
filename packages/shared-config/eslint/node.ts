import tseslint from 'typescript-eslint';
import type { Linter } from 'eslint';
import { baseConfig } from './base';

/**
 * Node.js-specific ESLint configuration
 * Extends base configuration with Node.js-specific rules and globals
 */
export const nodeConfig = tseslint.config(
  ...baseConfig,

  // Node.js specific configuration
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        console: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      // Node.js specific rules
      'no-process-exit': 'error',
      'no-process-env': 'off', // Allow process.env usage
      'no-sync': 'warn', // Warn about synchronous methods
      'handle-callback-err': 'error',
      'no-new-require': 'error',
      'no-path-concat': 'error',

      // Enhanced security for server-side code
      'security/detect-child-process': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
    },
  },

  // Utility modules - enforce readonly parameters
  {
    files: ['**/utils/**/*.ts', '**/lib/**/*.ts'],
    rules: {
      '@typescript-eslint/prefer-readonly-parameter-types': [
        'error',
        {
          checkParameterProperties: true,
          ignoreInferredTypes: true,
          treatMethodsAsReadonly: true,
        },
      ],
    },
  },

  // Configuration files - allow require and module.exports
  {
    files: [
      '**/*.config.js',
      '**/*.config.ts',
      '**/config/**/*.js',
      '**/config/**/*.ts',
    ],
    rules: {
      'security/detect-non-literal-require': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Test files for Node.js
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
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
      },
    },
    rules: {
      // Relaxed rules for Node.js tests
      'no-process-exit': 'off',
      'security/detect-child-process': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  }
) satisfies Linter.Config[];

export default nodeConfig;
