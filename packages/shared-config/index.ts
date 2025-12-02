/**
 * Shared configuration exports for the monorepo
 * Provides TypeScript and Vitest configurations for different environments
 */

// Vitest configurations
export { default as baseVitestConfig } from './vitest/base';
export { default as nodeVitestConfig } from './vitest/node';
export { default as reactVitestConfig } from './vitest/react';

// TypeScript configurations are JSON files, imported by extending them
// Base: packages/shared-config/typescript/base.json
// Node: packages/shared-config/typescript/node.json
// React: packages/shared-config/typescript/react.json
