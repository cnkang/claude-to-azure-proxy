#!/usr/bin/env tsx

/**
 * Build script for backend using SWC
 * This compiles the backend code with proper module resolution
 */

import { transformFile } from '@swc/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { glob } from 'glob';

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const packageJson: PackageJson = JSON.parse(
  readFileSync(join(backendDir, 'package.json'), 'utf-8')
);

// Get all dependencies to mark as external, except workspace packages
const externalDeps = Object.entries(packageJson.dependencies ?? {}).filter(
  ([dep]) => !dep.startsWith('@repo/')
);
const external: string[] = [
  ...externalDeps.map(([dep]) => dep),
  ...Object.keys(packageJson.peerDependencies ?? {}),
];

// eslint-disable-next-line no-console
console.log('🔨 Building backend with SWC...');
// eslint-disable-next-line no-console
console.log('📦 External packages:', external.join(', '));

// Check if building for production (Docker build or NODE_ENV=production)
const isProduction = process.env.NODE_ENV === 'production' || process.env.DOCKER_BUILD === 'true';

// SWC configuration
const swcOptions = {
  jsc: {
    parser: {
      syntax: 'typescript' as const,
      tsx: false,
      decorators: true,
      dynamicImport: true,
    },
    target: 'es2022' as const,
    loose: false,
    externalHelpers: false,
    keepClassNames: true,
    transform: {
      decoratorMetadata: true,
      legacyDecorator: true,
    },
    minify: isProduction ? {
      compress: true,
      mangle: true,
    } : undefined,
  },
  module: {
    type: 'es6' as const,
    strict: true,
    strictMode: true,
  },
  sourceMaps: !isProduction,
  inlineSourcesContent: false,
};

try {
  // Get all TypeScript files
  const srcDir = join(backendDir, 'src');
  const distDir = join(backendDir, 'dist');
  
  // Create dist directory
  mkdirSync(distDir, { recursive: true });
  
  // Find all .ts files
  const files = await glob('**/*.ts', { cwd: srcDir, absolute: false });
  
  // eslint-disable-next-line no-console
  console.log(`📝 Compiling ${files.length} TypeScript files...`);
  
  // Compile each file
  for (const file of files) {
    const inputPath = join(srcDir, file);
    const outputPath = join(distDir, file.replace(/\.ts$/, '.js'));
    const outputDir = dirname(outputPath);
    
    // Create output directory
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    mkdirSync(outputDir, { recursive: true });
    
    // Transform file
    const result = await transformFile(inputPath, swcOptions);
    
    // Write output
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(outputPath, result.code);
    
    // Write source map if enabled
    if (result.map !== undefined && !isProduction) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      writeFileSync(outputPath + '.map', result.map);
    }
  }
  
  // eslint-disable-next-line no-console
  console.log(`✅ Compiled ${files.length} files successfully!`);

  // Generate production package.json with only external dependencies
  const prodPackageJson = {
    name: packageJson.name ?? '@repo/backend',
    version: packageJson.version ?? '2.0.0',
    type: packageJson.type ?? 'module',
    dependencies: Object.fromEntries(externalDeps),
  };

  writeFileSync(
    join(backendDir, 'dist/package.json'),
    JSON.stringify(prodPackageJson, null, 2)
  );

  // Post-process: Add .js extensions to relative imports
  // eslint-disable-next-line no-console
  console.log('🔧 Adding .js extensions to relative imports...');
  
  const jsFiles = await glob('**/*.js', { cwd: distDir, absolute: false });
  for (const file of jsFiles) {
    const filePath = join(distDir, file);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    let content = readFileSync(filePath, 'utf-8');
    
    // Replace relative imports without .js extension
    // Match: from './path' or from "../path" but not from './path.js'
    content = content.replace(
      /from\s+['"](\.[^'"]+?)(?<!\.js)['"]/g,
      "from '$1.js'"
    );
    content = content.replace(
      /import\s+['"](\.[^'"]+?)(?<!\.js)['"]/g,
      "import '$1.js'"
    );
    
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(filePath, content);
  }
  
  // eslint-disable-next-line no-console
  console.log(`✅ Added .js extensions to ${jsFiles.length} files`);

  // eslint-disable-next-line no-console
  console.log('✅ Backend bundle built successfully!');
  // eslint-disable-next-line no-console
  console.log('📝 Generated production package.json with external dependencies only');
  if (isProduction) {
    // eslint-disable-next-line no-console
    console.log('🔒 Production build: source maps disabled, minification enabled');
  } else {
    // eslint-disable-next-line no-console
    console.log('🔧 Development build: source maps enabled, minification disabled');
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('❌ Build failed:', error);
  throw error;
}
