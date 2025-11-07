#!/usr/bin/env tsx

/**
 * Build script for backend using esbuild
 * This bundles the backend code with proper module resolution
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '../apps/backend');

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Read package.json to get dependencies
const packageJson: PackageJson = JSON.parse(
  readFileSync(join(backendDir, 'package.json'), 'utf-8')
);

// Get all dependencies to mark as external, except workspace packages
const externalDeps = Object.entries(packageJson.dependencies || {}).filter(
  ([dep]) => !dep.startsWith('@repo/')
);
const external: string[] = [
  ...externalDeps.map(([dep]) => dep),
  ...Object.keys(packageJson.peerDependencies || {}),
];

console.log('🔨 Building backend with esbuild...');
console.log('📦 External packages:', external.join(', '));
console.log('📦 Bundling workspace packages: @repo/*');

try {
  await build({
    entryPoints: [join(backendDir, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    outfile: join(backendDir, 'dist/index.js'),
    sourcemap: true,
    external,
    minify: false,
    keepNames: true,
    treeShaking: true,
    logLevel: 'info',
  });

  // Generate production package.json with only external dependencies
  const prodPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type || 'module',
    dependencies: Object.fromEntries(externalDeps),
  };

  writeFileSync(
    join(backendDir, 'dist/package.json'),
    JSON.stringify(prodPackageJson, null, 2)
  );

  console.log('✅ Backend bundle built successfully!');
  console.log('📝 Generated production package.json with external dependencies only');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
