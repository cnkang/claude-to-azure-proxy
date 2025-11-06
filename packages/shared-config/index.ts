/**
 * Shared configuration exports for the monorepo
 * Provides ESLint, TypeScript, and Vitest configurations for different environments
 */

// ESLint configurations
export { default as baseEslintConfig } from './eslint/base';
export { default as nodeEslintConfig } from './eslint/node';
export { default as reactEslintConfig } from './eslint/react';

// Vitest configurations
export { default as baseVitestConfig } from './vitest/base';
export { default as nodeVitestConfig } from './vitest/node';
export { default as reactVitestConfig } from './vitest/react';

// TypeScript configurations are JSON files, imported by extending them
// Base: packages/shared-config/typescript/base.json
// Node: packages/shared-config/typescript/node.json
// React: packages/shared-config/typescript/react.json
