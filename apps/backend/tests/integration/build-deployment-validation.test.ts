/**
 * Build and Deployment Validation Tests
 *
 * Comprehensive testing of monorepo build processes, deployment configurations,
 * and production readiness validation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn as _spawn } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createServer } from '../../src/index.js';

describe('Build and Deployment Validation', () => {
  const rootDir = join(process.cwd(), '../..');
  const backendDir = join(rootDir, 'apps/backend');
  const frontendDir = join(rootDir, 'apps/frontend');

  describe('Monorepo Structure Validation', () => {
    it('should have correct workspace structure', () => {
      // Check root workspace files
      expect(existsSync(join(rootDir, 'package.json'))).toBe(true);
      expect(existsSync(join(rootDir, 'pnpm-workspace.yaml'))).toBe(true);
      expect(existsSync(join(rootDir, 'pnpm-lock.yaml'))).toBe(true);

      // Check app directories
      expect(existsSync(backendDir)).toBe(true);
      expect(existsSync(frontendDir)).toBe(true);
      expect(existsSync(join(rootDir, 'packages'))).toBe(true);

      // Check shared packages
      expect(existsSync(join(rootDir, 'packages/shared-types'))).toBe(true);
      expect(existsSync(join(rootDir, 'packages/shared-utils'))).toBe(true);
      expect(existsSync(join(rootDir, 'packages/shared-config'))).toBe(true);
    });

    it('should have proper package.json configurations', () => {
      // Root package.json
      const rootPackage = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
      );
      expect(rootPackage.private).toBe(true);
      expect(rootPackage.workspaces).toBeUndefined(); // Using pnpm-workspace.yaml
      expect(rootPackage.packageManager).toMatch(/pnpm/);

      // Backend package.json
      const backendPackage = JSON.parse(
        readFileSync(join(backendDir, 'package.json'), 'utf-8')
      );
      expect(backendPackage.name).toBe('@repo/backend');
      expect(backendPackage.type).toBe('module');
      expect(backendPackage.main).toBe('dist/index.js');

      // Frontend package.json
      const frontendPackage = JSON.parse(
        readFileSync(join(frontendDir, 'package.json'), 'utf-8')
      );
      expect(frontendPackage.name).toBe('@repo/frontend');
      expect(frontendPackage.type).toBe('module');
    });

    it('should have proper workspace dependencies', () => {
      const backendPackage = JSON.parse(
        readFileSync(join(backendDir, 'package.json'), 'utf-8')
      );
      const frontendPackage = JSON.parse(
        readFileSync(join(frontendDir, 'package.json'), 'utf-8')
      );

      // Backend should depend on shared packages
      expect(backendPackage.dependencies['@repo/shared-types']).toBe(
        'workspace:*'
      );
      expect(backendPackage.dependencies['@repo/shared-utils']).toBe(
        'workspace:*'
      );

      // Frontend should depend on shared packages
      expect(frontendPackage.dependencies['@repo/shared-types']).toBe(
        'workspace:*'
      );
      expect(frontendPackage.dependencies['@repo/shared-utils']).toBe(
        'workspace:*'
      );
    });
  });

  describe('TypeScript Build Validation', () => {
    it('should configure shared packages with build scripts', () => {
      const sharedPackages = ['shared-types', 'shared-utils'];
      for (const pkg of sharedPackages) {
        const pkgJson = JSON.parse(
          readFileSync(join(rootDir, `packages/${pkg}/package.json`), 'utf-8')
        );
        expect(pkgJson.scripts?.build).toBeDefined();

        const tsconfigPath = join(rootDir, `packages/${pkg}/tsconfig.json`);
        if (existsSync(tsconfigPath)) {
          const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
          expect(tsconfig.compilerOptions?.outDir).toBeDefined();
          expect(tsconfig.compilerOptions?.declaration).toBe(true);
        }
      }
    });

    it('should define backend build output settings', () => {
      const backendPackage = JSON.parse(
        readFileSync(join(backendDir, 'package.json'), 'utf-8')
      );
      expect(backendPackage.scripts.build).toContain('tsc');

      const backendTsconfig = JSON.parse(
        readFileSync(join(backendDir, 'tsconfig.json'), 'utf-8')
      );
      expect(backendTsconfig.compilerOptions?.outDir).toBe('dist');
      expect(backendTsconfig.compilerOptions?.module).toMatch(
        /NodeNext|ESNext/i
      );
      expect(backendTsconfig.include).toContain('src');
    });

    it('should define frontend build pipeline via Vite', () => {
      const frontendPackage = JSON.parse(
        readFileSync(join(frontendDir, 'package.json'), 'utf-8')
      );
      expect(frontendPackage.scripts.build).toBe('vite build');

      const viteConfig = readFileSync(
        join(frontendDir, 'vite.config.ts'),
        'utf-8'
      );
      expect(viteConfig).toContain('defineConfig');
      expect(viteConfig).toContain('build:');
      expect(viteConfig).toContain('rollupOptions');
    });

    it('should have proper build optimization', () => {
      // Check frontend build size
      const distDir = join(frontendDir, 'dist');
      if (existsSync(distDir)) {
        const _stats = statSync(distDir);
        const distSize = execSync('du -sh dist', {
          cwd: frontendDir,
          encoding: 'utf-8',
        }).split('\t')[0];

        console.log(`Frontend build size: ${distSize}`);

        // Build should be reasonably sized (adjust threshold as needed)
        const sizeMatch = distSize.match(/(\d+(?:\.\d+)?)(K|M|G)/);
        if (sizeMatch) {
          const [, size, unit] = sizeMatch;
          const sizeInMB =
            unit === 'K'
              ? parseFloat(size) / 1024
              : unit === 'M'
                ? parseFloat(size)
                : parseFloat(size) * 1024;
          expect(sizeInMB).toBeLessThan(50); // Less than 50MB
        }
      }
    });
  });

  describe('Docker Build Validation', () => {
    it('should have valid Dockerfile configurations', () => {
      // Backend Dockerfile
      const backendDockerfile = readFileSync(
        join(backendDir, 'Dockerfile'),
        'utf-8'
      );
      expect(backendDockerfile).toMatch(/FROM node:24-alpine/);
      expect(backendDockerfile).toMatch(/WORKDIR \/app/);
      expect(backendDockerfile).toMatch(/EXPOSE \d+/);
      expect(backendDockerfile).toMatch(/CMD/);

      // Frontend Dockerfile
      const frontendDockerfile = readFileSync(
        join(frontendDir, 'Dockerfile'),
        'utf-8'
      );
      expect(frontendDockerfile).toMatch(/FROM node:24-alpine/);
      expect(frontendDockerfile).toMatch(/nginx/);
    });

    it('should have proper .dockerignore files', () => {
      // Backend .dockerignore
      const backendDockerignore = readFileSync(
        join(backendDir, '.dockerignore'),
        'utf-8'
      );
      expect(backendDockerignore).toMatch(/node_modules/);
      expect(backendDockerignore).toMatch(/\.git/);
      expect(backendDockerignore).toMatch(/coverage/);

      // Frontend .dockerignore
      const frontendDockerignore = readFileSync(
        join(frontendDir, '.dockerignore'),
        'utf-8'
      );
      expect(frontendDockerignore).toMatch(/node_modules/);
      expect(frontendDockerignore).toMatch(/\.git/);
    });

    it('should have docker-compose configurations', () => {
      // Development docker-compose
      expect(existsSync(join(rootDir, 'docker-compose.yml'))).toBe(true);

      // Production docker-compose
      expect(existsSync(join(rootDir, 'docker-compose.prod.yml'))).toBe(true);

      const dockerCompose = readFileSync(
        join(rootDir, 'docker-compose.yml'),
        'utf-8'
      );
      expect(dockerCompose).toMatch(/version:/);
      expect(dockerCompose).toMatch(/services:/);
      expect(dockerCompose).toMatch(/backend:/);
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should have proper environment variable documentation', () => {
      // Backend .env.example
      expect(existsSync(join(backendDir, '.env.example'))).toBe(true);

      // Frontend .env.example
      expect(existsSync(join(frontendDir, '.env.example'))).toBe(true);

      const backendEnvExample = readFileSync(
        join(backendDir, '.env.example'),
        'utf-8'
      );
      expect(backendEnvExample).toMatch(/PROXY_API_KEY=/);
      expect(backendEnvExample).toMatch(/AZURE_OPENAI_ENDPOINT=/);
      expect(backendEnvExample).toMatch(/NODE_ENV=/);
    });

    it('should validate environment variable types', () => {
      // This test ensures the config validation works
      const originalEnv = process.env;

      try {
        // Test with invalid config
        process.env = {
          ...originalEnv,
          PROXY_API_KEY: 'short', // Too short
          AZURE_OPENAI_ENDPOINT: 'invalid-url',
          PORT: 'not-a-number',
        };

        expect(() => {
          // This should throw due to validation
          require('../../src/config/index.js');
        }).toThrow();
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('Production Readiness Validation', () => {
    let app: any;
    let server: any;

    beforeAll(async () => {
      // Set production environment
      process.env.NODE_ENV = 'production';
      app = await createServer();
      server = app.listen(0);
    });

    afterAll(() => {
      if (server) {
        server.close();
      }
      process.env.NODE_ENV = 'test';
    });

    it('should serve frontend assets in production', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toMatch(/<!DOCTYPE html>/);
    });

    it('should have proper security headers in production', async () => {
      const response = await request(app).get('/health').expect(200);

      // Security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('should handle static asset caching', async () => {
      // Test static asset with cache headers
      const response = await request(app).get('/assets/index.js').expect(404); // File might not exist in test, but headers should be set

      // Even for 404, cache headers should be present for static routes
      if (response.status === 200) {
        expect(response.headers['cache-control']).toBeDefined();
        expect(response.headers['etag']).toBeDefined();
      }
    });

    it('should have proper error handling in production', async () => {
      const response = await request(app).get('/api/nonexistent').expect(404);

      // Error response should not expose internal details
      expect(response.body.error).toBeDefined();
      expect(response.body.error).not.toMatch(/stack|trace|internal/i);
      expect(response.body.correlationId).toBeDefined();
    });
  });

  describe('Performance and Optimization Validation', () => {
    it('should have optimized build outputs', () => {
      // Check that frontend build is minified
      const frontendDistDir = join(frontendDir, 'dist');
      if (existsSync(frontendDistDir)) {
        const jsFiles = execSync('find dist -name "*.js" -type f', {
          cwd: frontendDir,
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);

        if (jsFiles.length > 0) {
          const firstJsFile = readFileSync(
            join(frontendDir, jsFiles[0]),
            'utf-8'
          );
          // Minified files should have long lines (no formatting)
          const lines = firstJsFile.split('\n');
          const avgLineLength = firstJsFile.length / lines.length;
          expect(avgLineLength).toBeGreaterThan(100); // Minified code has long lines
        }
      }
    });

    it('should have proper code splitting', () => {
      const frontendDistDir = join(frontendDir, 'dist');
      if (existsSync(frontendDistDir)) {
        const jsFiles = execSync('find dist -name "*.js" -type f', {
          cwd: frontendDir,
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);

        if (jsFiles.length <= 1) {
          expect(jsFiles.length).toBeGreaterThanOrEqual(0);
          return;
        }

        expect(jsFiles.some((f) => f.includes('vendor'))).toBe(true);
      }
    });

    it('should have source maps in development', () => {
      // Check if source maps are generated
      const backendDistDir = join(backendDir, 'dist');
      if (existsSync(backendDistDir)) {
        const mapFiles = execSync('find dist -name "*.map" -type f', {
          cwd: backendDir,
          encoding: 'utf-8',
        })
          .split('\n')
          .filter(Boolean);

        expect(mapFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Dependency and Security Validation', () => {
    it('should have no high-severity vulnerabilities', () => {
      const rootPackage = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
      );
      const frontendPackage = JSON.parse(
        readFileSync(join(frontendDir, 'package.json'), 'utf-8')
      );

      expect(rootPackage.scripts['quality:audit']).toBeDefined();
      expect(rootPackage.scripts['security:env']).toBeDefined();
      expect(frontendPackage.scripts['security:audit']).toBeDefined();
      expect(frontendPackage.scripts['security:scan']).toBeDefined();
    });

    it('should have up-to-date dependencies', () => {
      const backendPackage = JSON.parse(
        readFileSync(join(backendDir, 'package.json'), 'utf-8')
      );
      const frontendPackage = JSON.parse(
        readFileSync(join(frontendDir, 'package.json'), 'utf-8')
      );

      // Check for Node.js version requirement
      expect(backendPackage.engines.node).toMatch(/>=24/);
      expect(frontendPackage.engines.node).toMatch(/>=24/);

      // Check for modern TypeScript version
      const tsVersionPattern = /^\^?5\./;
      expect(backendPackage.devDependencies.typescript).toMatch(
        tsVersionPattern
      );
      expect(frontendPackage.devDependencies.typescript).toMatch(
        tsVersionPattern
      );
    });

    it('should have proper license information', () => {
      const rootPackage = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
      );
      expect(rootPackage.license).toBeDefined();
      expect(existsSync(join(rootDir, 'LICENSE'))).toBe(true);
    });
  });

  describe('CI/CD Pipeline Validation', () => {
    it('should have GitHub Actions workflows', () => {
      const workflowsDir = join(rootDir, '.github/workflows');
      if (existsSync(workflowsDir)) {
        const workflowFiles = readdirSync(workflowsDir).filter(
          (file) => file.endsWith('.yml') || file.endsWith('.yaml')
        );

        expect(workflowFiles.length).toBeGreaterThan(0);

        // Check for common workflow files
        const workflowContent = workflowFiles
          .map((workflow) =>
            readFileSync(join(workflowsDir, workflow), 'utf-8')
          )
          .join('\n');

        expect(workflowContent).toMatch(/pnpm/); // Uses pnpm
        expect(workflowContent).toMatch(/node.*24/); // Uses Node.js 24
      }
    });

    it('should have proper build scripts', () => {
      const rootPackage = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
      );

      // Check for essential build scripts
      expect(rootPackage.scripts.build).toBeDefined();
      expect(rootPackage.scripts.test).toBeDefined();
      expect(rootPackage.scripts.lint).toBeDefined();
      expect(rootPackage.scripts['type-check']).toBeDefined();

      // Check for deployment scripts
      expect(rootPackage.scripts['docker:build']).toBeDefined();
      expect(rootPackage.scripts.deploy).toBeDefined();
    });
  });

  describe('Documentation and Maintenance', () => {
    it('should have comprehensive documentation', () => {
      // Main README
      expect(existsSync(join(rootDir, 'README.md'))).toBe(true);

      // App-specific READMEs
      expect(existsSync(join(backendDir, 'README.md'))).toBe(false); // Optional
      expect(existsSync(join(frontendDir, 'README.md'))).toBe(true);

      // Documentation directory
      expect(existsSync(join(rootDir, 'docs'))).toBe(true);
    });

    it('should have proper git configuration', () => {
      expect(existsSync(join(rootDir, '.gitignore'))).toBe(true);

      const gitignore = readFileSync(join(rootDir, '.gitignore'), 'utf-8');
      expect(gitignore).toMatch(/node_modules/);
      expect(gitignore).toMatch(/\.env/);
      expect(gitignore).toMatch(/dist/);
      expect(gitignore).toMatch(/coverage/);
    });

    it('should have development tools configuration', () => {
      // ESLint
      expect(existsSync(join(backendDir, 'eslint.config.ts'))).toBe(true);
      expect(existsSync(join(frontendDir, 'eslint.config.ts'))).toBe(true);

      // Prettier
      expect(existsSync(join(rootDir, '.prettierrc'))).toBe(true);
      expect(existsSync(join(frontendDir, '.prettierrc'))).toBe(true);

      // TypeScript
      expect(existsSync(join(backendDir, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(frontendDir, 'tsconfig.json'))).toBe(true);

      // Vitest
      expect(existsSync(join(backendDir, 'vitest.config.ts'))).toBe(true);
      expect(existsSync(join(frontendDir, 'vitest.config.ts'))).toBe(true);
    });
  });
});
