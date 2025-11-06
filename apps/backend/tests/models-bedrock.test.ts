import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

let app: express.Application;
let restoreBedrockFlag: (() => void) | undefined;

beforeAll(async () => {
  const configModule = await import('../src/config/index.js');
  const originalCheck = configModule.isAWSBedrockConfigured;
  configModule.isAWSBedrockConfigured = () => true;
  restoreBedrockFlag = () => {
    configModule.isAWSBedrockConfigured = originalCheck;
  };

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
  restoreBedrockFlag?.();
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
