import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.doUnmock('../src/config/index.js');

describe('Configuration Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let exitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock process.exit to prevent tests from actually exiting
    originalExit = process.exit.bind(process);
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

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

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

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

      expect(config.PORT).toBe(8080); // Default value
      expect(config.NODE_ENV).toBe('production'); // Default value
    });

    it('should freeze the configuration object', async () => {
      // Set valid environment variables
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

      expect(Object.isFrozen(config)).toBe(true);

      // Attempting to modify should throw in strict mode (which TypeScript enables)
      expect(() => {
        (config as any).PORT = 9999;
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

  describe('Optional overrides and summaries', () => {
    it('applies Azure overrides and reports configuration summary', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4o';
      process.env.AZURE_OPENAI_TIMEOUT = '60000';
      process.env.AZURE_OPENAI_MAX_RETRIES = '6';

      process.env.DEFAULT_REASONING_EFFORT = 'medium';
      process.env.ENABLE_CONTENT_SECURITY_VALIDATION = 'false';

      const configModule = await import(
        '../src/config/index.js?t=' + Date.now()
      );
      const config = configModule.default as Record<string, unknown>;

      expect(config.AZURE_OPENAI_TIMEOUT).toBe(60000);
      expect(config.AZURE_OPENAI_MAX_RETRIES).toBe(6);

      expect(config.ENABLE_CONTENT_SECURITY_VALIDATION).toBe(false);

      const summary = configModule.getConfigurationSummary();
      expect(summary.timeout).toBe(60000);
      expect(summary.maxRetries).toBe(6);
      expect(summary.azureApiVersion).toBe('v1');
    });

    it('exits when DEFAULT_REASONING_EFFORT is invalid', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.DEFAULT_REASONING_EFFORT = 'extreme';

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

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

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

  describe('AWS Bedrock Configuration', () => {
    it('should load configuration with AWS Bedrock settings', async () => {
      // Set valid environment variables including AWS Bedrock
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.AWS_BEDROCK_API_KEY = 'c'.repeat(32);
      process.env.AWS_BEDROCK_REGION = 'us-west-2';
      process.env.AWS_BEDROCK_TIMEOUT = '90000';
      process.env.AWS_BEDROCK_MAX_RETRIES = '5';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

      expect(config.AWS_BEDROCK_API_KEY).toBe('c'.repeat(32));
      expect(config.AWS_BEDROCK_REGION).toBe('us-west-2');
      expect(config.AWS_BEDROCK_TIMEOUT).toBe(90000);
      expect(config.AWS_BEDROCK_MAX_RETRIES).toBe(5);
    });

    it('should use default values for AWS Bedrock optional settings', async () => {
      // Set required variables but not AWS Bedrock
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as { default: Record<string, unknown> };
      const config = configModule.default;

      expect(config.AWS_BEDROCK_API_KEY).toBeUndefined();
      expect(config.AWS_BEDROCK_REGION).toBe('us-west-2'); // Default value
      expect(config.AWS_BEDROCK_TIMEOUT).toBe(120000); // Default value
      expect(config.AWS_BEDROCK_MAX_RETRIES).toBe(3); // Default value
    });

    it('should validate createAWSBedrockConfig function', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.AWS_BEDROCK_API_KEY = 'c'.repeat(32);
      process.env.AWS_BEDROCK_REGION = 'us-west-2';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as {
        default: Record<string, unknown>;
        createAWSBedrockConfig: (config: any) => any;
      };
      const config = configModule.default;
      const bedrockConfig = configModule.createAWSBedrockConfig(config);

      expect(bedrockConfig.baseURL).toBe(
        'https://bedrock-runtime.us-west-2.amazonaws.com'
      );
      expect(bedrockConfig.apiKey).toBe('c'.repeat(32));
      expect(bedrockConfig.region).toBe('us-west-2');
      expect(bedrockConfig.timeout).toBe(120000);
      expect(bedrockConfig.maxRetries).toBe(3);
    });

    it('should validate isAWSBedrockConfigured function', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';
      process.env.AWS_BEDROCK_API_KEY = 'c'.repeat(32);

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as {
        default: Record<string, unknown>;
        isAWSBedrockConfigured: (config: any) => boolean;
      };
      const config = configModule.default;

      expect(configModule.isAWSBedrockConfigured(config)).toBe(true);
    });

    it('should return false for isAWSBedrockConfigured when not configured', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as {
        default: Record<string, unknown>;
        isAWSBedrockConfigured: (config: any) => boolean;
      };
      const config = configModule.default;

      expect(configModule.isAWSBedrockConfigured(config)).toBe(false);
    });

    it('should throw error when creating Bedrock config without API key', async () => {
      process.env.PROXY_API_KEY = 'a'.repeat(32);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_API_KEY = 'b'.repeat(32);
      process.env.AZURE_OPENAI_MODEL = 'gpt-4';

      const configModule = (await import(
        '../src/config/index.js?t=' + Date.now()
      )) as {
        default: Record<string, unknown>;
        createAWSBedrockConfig: (config: any) => any;
      };
      const config = configModule.default;

      expect(() => configModule.createAWSBedrockConfig(config)).toThrow(
        'AWS Bedrock API key is required to create Bedrock configuration'
      );
    });
  });
});
