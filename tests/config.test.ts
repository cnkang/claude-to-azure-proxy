import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Config } from '../src/config/index.js';

describe('Configuration Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let exitSpy: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock process.exit to prevent tests from actually exiting
    originalExit = process.exit;
    exitSpy = vi.fn();
    process.exit = exitSpy;

    // Clear all environment variables that might affect the config
    delete process.env.PROXY_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_MODEL;
    delete process.env.PORT;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore original process.exit
    process.exit = originalExit;

    // Clear module cache for fresh imports
    vi.resetModules();
  });

  describe('Valid Configuration', () => {
    it('should load valid configuration successfully', async () => {
      // Set valid environment variables
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';

      const { default: config } = await import(
        '../src/config/index.js?t=' + Date.now()
      );

      expect(config.PROXY_API_KEY).toBe('a'.repeat(32));
      expect(config.AZURE_OPENAI_ENDPOINT).toBe(
        'https://test.openai.azure.com'
      );
      expect(config.AZURE_OPENAI_API_KEY).toBe('b'.repeat(32));
      expect(config.AZURE_OPENAI_MODEL).toBe('gpt-4');
      expect(config.PORT).toBe(3000);
      expect(config.NODE_ENV).toBe('development');
    });

    it('should use default values for optional variables', async () => {
      // Set only required environment variables
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const { default: config } = await import(
        '../src/config/index.js?t=' + Date.now()
      );

      expect(config.PORT).toBe(8080); // Default value
      expect(config.NODE_ENV).toBe('production'); // Default value
    });

    it('should freeze the configuration object', async () => {
      // Set valid environment variables
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const { default: config } = await import(
        '../src/config/index.js?t=' + Date.now()
      );

      expect(Object.isFrozen(config)).toBe(true);

      // Attempting to modify should throw in strict mode (which TypeScript enables)
      expect(() => {
        config.PORT = 9999;
      }).toThrow();

      // Value should remain unchanged
      expect(config.PORT).toBe(8080);
    });
  });

  describe('Invalid Configuration', () => {
    it('should exit when PROXY_API_KEY is missing', async () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when PROXY_API_KEY is too short', async () => {
      process.env.PROXY_API_KEY = 'short';
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when AZURE_OPENAI_ENDPOINT is not HTTPS', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'http://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when AZURE_OPENAI_ENDPOINT is missing', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when AZURE_OPENAI_API_KEY is missing', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when AZURE_OPENAI_MODEL is missing', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when AZURE_OPENAI_MODEL has invalid characters', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'invalid@model!';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when PORT is out of range', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.PORT = '80'; // Below minimum

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when NODE_ENV has invalid value', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.NODE_ENV = 'invalid';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with detailed error messages for multiple validation failures', async () => {
      process.env.PROXY_API_KEY = 'short';
      process.env.AZURE_OPENAI_ENDPOINT = 'http://invalid';
      // Missing AZURE_OPENAI_API_KEY and AZURE_OPENAI_MODEL

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Data Type Validation', () => {
    it('should convert PORT to number', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.PORT = '3000'; // String input

      const { default: config } = await import(
        '../src/config/index.js?t=' + Date.now()
      );

      expect(typeof config.PORT).toBe('number');
      expect(config.PORT).toBe(3000);
    });

    it('should exit when AZURE_OPENAI_ENDPOINT has invalid URL format', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'not-a-url';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when key length constraints are violated', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(257); // Too long
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      await import('../src/config/index.js?t=' + Date.now());

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
