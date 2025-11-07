#!/usr/bin/env tsx

/**
 * Build script for backend using esbuild
 * This bundles the backend code with proper module resolution
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '../apps/backend');

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Read package.json to get dependencies
const packageJson: PackageJson = JSON.parse(
  readFileSync(join(backendDir, 'package.json'), 'utf-8')
);

// Get all dependencies to mark as external
const external: string[] = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.peerDependencies || {}),
];

console.log('🔨 Building backend with esbuild...');

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
    // Resolve workspace packages
    packages: 'external',
  });

  console.log('✅ Backend bundle built successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
