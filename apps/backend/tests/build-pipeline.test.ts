import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const isNode24OrHigher =
  Number.parseInt(process.versions.node.split('.', 10)[0], 10) >= 24;
const describeOrSkip = isNode24OrHigher ? describe : describe.skip;

describeOrSkip('Build Pipeline Tests', () => {
  const projectRoot = process.cwd();
  const repoRoot = join(projectRoot, '..', '..');
  const distDir = join(projectRoot, 'dist');
  const packageJsonPath = join(projectRoot, 'package.json');
  const dockerfilePath = join(projectRoot, 'Dockerfile');

  describe('TypeScript Build Process', () => {
    beforeAll(() => {
      // Clean any existing build artifacts
      try {
        execSync('pnpm run build:clean', { stdio: 'pipe' });
      } catch {
        // Ignore if clean fails
      }
    });

    it('should build TypeScript successfully', () => {
      expect(() => {
        execSync('pnpm run build', { stdio: 'pipe' });
      }).not.toThrow();
    });

    it('should generate dist directory with compiled files', () => {
      expect(existsSync(distDir)).toBe(true);
      expect(existsSync(join(distDir, 'index.js'))).toBe(true);
      expect(existsSync(join(distDir, 'config'))).toBe(true);
      expect(existsSync(join(distDir, 'utils'))).toBe(true);
      expect(existsSync(join(distDir, 'middleware'))).toBe(true);
    });

    it('should generate source maps', () => {
      expect(existsSync(join(distDir, 'index.js.map'))).toBe(true);
    });

    it('should generate TypeScript declaration files', () => {
      expect(existsSync(join(distDir, 'index.d.ts'))).toBe(true);
    });

    it('should have valid JavaScript syntax in compiled files', () => {
      const indexJs = readFileSync(join(distDir, 'index.js'), 'utf-8');
      expect(indexJs).toContain('export');
      expect(indexJs).not.toContain('import type');
      expect(indexJs).not.toContain('interface ');
    });

    it('should pass type checking', () => {
      expect(() => {
        execSync('pnpm run type-check', { stdio: 'pipe' });
      }).not.toThrow();
    });
  });

  describe('Package.json Configuration', () => {
    let packageJson: any;

    beforeAll(() => {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    });

    it('should require Node.js 24+', () => {
      expect(packageJson.engines.node).toBe('>=24.0.0');
    });

    it('should use ES modules', () => {
      expect(packageJson.type).toBe('module');
    });

    it('should have correct main entry point', () => {
      expect(packageJson.main).toBe('dist/index.js');
    });

    it('should have enhanced build scripts', () => {
      expect(packageJson.scripts.build).toContain('--build --verbose');
      expect(packageJson.scripts['build:clean']).toBeDefined();
      expect(packageJson.scripts.start).toContain('--enable-source-maps');
      expect(packageJson.scripts['start:prod']).toContain(
        '--max-old-space-size=1024'
      );
    });

    it('should have Node.js 24 optimized development scripts', () => {
      expect(packageJson.scripts.dev).toContain('tsx watch');
      expect(packageJson.scripts['dev:debug']).toContain('--inspect');
    });

    it('should have enhanced monitoring scripts', () => {
      expect(packageJson.scripts['monitoring:heap']).toContain('--heap-prof');
      expect(packageJson.scripts['monitoring:cpu']).toContain('--cpu-prof');
    });

    it('should use latest compatible dependencies', () => {
      expect(packageJson.dependencies.axios).toMatch(/^\^1\.13\./);
      expect(packageJson.dependencies.openai).toMatch(/^\^6\.7\./);
      expect(packageJson.devDependencies.vitest).toMatch(/^\^4\./);
      expect(packageJson.devDependencies['@vitest/coverage-v8']).toMatch(
        /^\^4\./
      );
    });
  });

  describe('Docker Build Process', () => {
    const testImageName = 'claude-to-azure-proxy:test';

    it('should have valid Dockerfile', () => {
      expect(existsSync(dockerfilePath)).toBe(true);
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('FROM node:24-alpine');
      expect(dockerfile).toContain('--init');
      expect(dockerfile).toContain('--enable-source-maps');
    });

    it('should build Docker image successfully', () => {
      expect(() => {
        execSync(`docker build -t ${testImageName} ${repoRoot}`, {
          stdio: 'pipe',
          timeout: 120000, // 2 minutes timeout
        });
      }).not.toThrow();
    }, 180000);

    it('should create multi-stage build with proper layers', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('FROM node:24-alpine AS base');
      expect(dockerfile).toContain('FROM base AS deps');
      expect(dockerfile).toContain('FROM base AS builder');
      expect(dockerfile).toContain('FROM node:24-alpine AS runner');
    });

    it('should use non-root user', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('USER appuser');
      expect(dockerfile).toContain('--chown=appuser:nodejs');
    });

    it('should have proper Node.js 24 optimizations', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain(
        'NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"'
      );
      expect(dockerfile).toContain('UV_THREADPOOL_SIZE=4');
    });

    it('should have enhanced health check', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('--timeout=10s');
      expect(dockerfile).toContain('--start-period=15s');
    });

    it('should use Docker init for proper signal handling', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('ENTRYPOINT ["dumb-init"');
      expect(dockerfile).toContain('CMD ["node"');
    });
  });

  describe('Docker Container Health Check', () => {
    const testImageName = 'claude-to-azure-proxy:test';

    afterAll(() => {
      // Clean up all test images
      try {
        execSync(`docker rmi ${testImageName}`, { stdio: 'pipe' });
      } catch {
        // Ignore if image doesn't exist
      }
      try {
        execSync('docker rmi claude-to-azure-proxy:test-validation', {
          stdio: 'pipe',
        });
      } catch {
        // Ignore if image doesn't exist
      }
    });

    it('should have proper health check configuration', () => {
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('--interval=30s');
      expect(dockerfile).toContain('--timeout=10s');
      expect(dockerfile).toContain('--start-period=15s');
      expect(dockerfile).toContain('--retries=3');
    });

    it('should validate Docker image exists after build', () => {
      // Check if the test image built in the previous test exists
      let output = execSync(
        'docker images claude-to-azure-proxy --format "{{.Repository}}:{{.Tag}}"',
        {
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      // If no image exists, build one for validation
      if (output.trim() === '') {
        // Build the image to verify it can be built successfully
        expect(() => {
          execSync(
            `docker build -f ${dockerfilePath} -t claude-to-azure-proxy:test-validation ${repoRoot}`,
            {
              stdio: 'pipe',
              timeout: 120000,
            }
          );
        }).not.toThrow();

        // Re-check for the newly built image
        output = execSync(
          'docker images claude-to-azure-proxy --format "{{.Repository}}:{{.Tag}}"',
          {
            encoding: 'utf-8',
            stdio: 'pipe',
          }
        );
      }

      expect(output).toContain('claude-to-azure-proxy:');
      expect(output.trim()).not.toBe('');
    }, 180000);
  });

  describe('Build Performance and Size', () => {
    it('should have reasonable build output size', () => {
      const distStats = statSync(distDir);
      expect(distStats.isDirectory()).toBe(true);

      // Check that main files exist and are not empty
      const indexJsStats = statSync(join(distDir, 'index.js'));
      expect(indexJsStats.size).toBeGreaterThan(1000); // At least 1KB
      expect(indexJsStats.size).toBeLessThan(1024 * 1024); // Less than 1MB
    });

    it('should complete build in reasonable time', () => {
      const startTime = Date.now();
      execSync('pnpm run build', { stdio: 'pipe' });
      const buildTime = Date.now() - startTime;

      // Build should complete within 30 seconds
      expect(buildTime).toBeLessThan(30000);
    });

    it('should have proper file permissions in dist', () => {
      const indexJsStats = statSync(join(distDir, 'index.js'));
      // File should be readable
      expect(indexJsStats.mode & 0o444).toBeTruthy();
    });
  });

  describe('Deployment Compatibility', () => {
    it('should have AWS App Runner compatible configuration', () => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Should have proper start script
      expect(packageJson.scripts.start).toBeDefined();
      expect(packageJson.scripts.start).toContain('dist/index.js');

      // Should support PORT environment variable
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('EXPOSE 8080');
    });

    it('should have proper environment variable documentation in config', () => {
      // Check that the built application has proper configuration validation
      expect(existsSync(join(distDir, 'config', 'index.js'))).toBe(true);

      const configJs = readFileSync(
        join(distDir, 'config', 'index.js'),
        'utf-8'
      );
      expect(configJs).toContain('PROXY_API_KEY');
      expect(configJs).toContain('AZURE_OPENAI_ENDPOINT');
      expect(configJs).toContain('AZURE_OPENAI_API_KEY');
    });

    it('should handle graceful shutdown', () => {
      // This test verifies that Docker's built-in init is properly configured
      const dockerfile = readFileSync(dockerfilePath, 'utf-8');
      expect(dockerfile).toContain('ENTRYPOINT ["dumb-init"');
      expect(dockerfile).toContain('CMD ["node"');
    });
  });
});
