import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let app: express.Application;
let restoreConfig: (() => void) | undefined;

beforeAll(async () => {
  // Mock the config module to include Bedrock models
  vi.doMock('../src/config/index.js', async () => {
    const actual = await vi.importActual<typeof import('../src/config/index.js')>('../src/config/index.js');
    return {
      ...actual,
      default: {
        ...actual.default,
        AWS_BEDROCK_MODELS: 'qwen-3-coder,qwen.qwen3-coder-480b-a35b-v1:0',
        AWS_REGION: 'us-east-1',
      },
      isAWSBedrockConfigured: () => true,
    };
  });

  restoreConfig = () => {
    vi.doUnmock('../src/config/index.js');
  };

  // Import routes after mocking config
  const { modelsHandler } = await import('../src/routes/models.js');
  const { secureAuthenticationMiddleware } = await import(
    '../src/middleware/authentication.js'
  );
  const { correlationIdMiddleware } = await import(
    '../src/middleware/security.js'
  );

  app = express();
  app.use(correlationIdMiddleware);
  app.get('/v1/models', secureAuthenticationMiddleware, modelsHandler);
});

afterAll(() => {
  restoreConfig?.();
  vi.resetModules();
});

describe('Models endpoint with Bedrock enabled', () => {
  it('includes Bedrock model entries when configuration is present', async () => {
    const response = await request(app)
      .get('/v1/models')
      .set(
        'Authorization',
        'Bearer test-api-key-12345678901234567890123456789012'
      )
      .expect(200);

    const providers = new Set(
      (response.body.data as Array<{ provider?: string }> | undefined)?.map(
        (model) => model.provider
      ) ?? []
    );

    expect(providers.has('bedrock')).toBe(true);
    expect(
      response.body.data?.some((model: { id: string }) =>
        model.id.includes('qwen')
      )
    ).toBe(true);
  });
});
