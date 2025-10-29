import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { json } from 'express';
import request from 'supertest';
import { setupAllMocks, mockResponses } from './utils/typed-mocks.js';
import { createMockConfig, testServerConfig, validApiKey } from './test-config.js';

const createBedrockProcessingResult = (stream = false) => {
  const base = mockResponses.universalProcessingResult();
  return {
    ...base,
    responsesParams: {
      ...base.responsesParams,
      model: 'qwen-3-coder',
      input: 'Bedrock request payload',
      stream,
    },
    routingDecision: {
      provider: 'bedrock' as const,
      requestedModel: 'qwen-3-coder',
      backendModel: 'qwen.qwen3-coder-480b-a35b-v1:0',
      isSupported: true,
    },
  };
};

describe('Completions handler - Bedrock routing', () => {
  let app: express.Application;
  let mocks: ReturnType<typeof setupAllMocks>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks = setupAllMocks();

    vi.doMock('../src/config/index.js', () => {
      const base = createMockConfig();
      return {
        ...base,
        default: {
          ...base.default,
          AWS_BEDROCK_API_KEY: 'test-bedrock-key-12345678901234567890123456789012',
          AWS_BEDROCK_REGION: 'us-west-2',
          AWS_BEDROCK_TIMEOUT: 45000,
          AWS_BEDROCK_MAX_RETRIES: 2,
        },
        isAWSBedrockConfigured: () => true,
        createAWSBedrockConfig: vi.fn(() => ({
          baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
          apiKey: 'test-bedrock-key-12345678901234567890123456789012',
          region: 'us-west-2',
          timeout: 45000,
          maxRetries: 2,
        })),
      };
    });

    vi.doMock('../src/clients/azure-responses-client.js', () => ({
      AzureResponsesClient: class MockAzureResponsesClient {
        constructor(_config: unknown) {
          return mocks.azureClient;
        }
      },
    }));

    vi.doMock('../src/clients/aws-bedrock-client.js', () => ({
      AWSBedrockClient: class MockAWSBedrockClient {
        constructor(_config: unknown) {
          return mocks.bedrockClient;
        }
      },
    }));

    vi.doMock('../src/utils/universal-request-processor.js', () => ({
      createUniversalRequestProcessor: vi.fn(() => mocks.universalProcessor),
      defaultUniversalProcessorConfig: {},
    }));

    vi.doMock('../src/utils/reasoning-effort-analyzer.js', () => ({
      createReasoningEffortAnalyzer: vi.fn(() => mocks.reasoningAnalyzer),
    }));

    vi.doMock('../src/utils/conversation-manager.js', () => ({
      conversationManager: mocks.conversationManager,
    }));

    vi.doMock('../src/resilience/index.js', () => ({
      circuitBreakerRegistry: {
        getCircuitBreaker: vi.fn(() => ({
          execute: vi.fn(async (fn: () => Promise<unknown>) => ({
            success: true,
            data: await fn(),
          })),
        })),
      },
      retryStrategyRegistry: {
        getStrategy: vi.fn(() => ({
          execute: vi.fn(async (fn: () => Promise<unknown>) => ({
            success: true,
            data: await fn(),
          })),
        })),
      },
      gracefulDegradationManager: mocks.gracefulDegradation,
    }));

    vi.doMock('../src/monitoring/health-monitor.js', () => ({
      getHealthMonitor: vi.fn(() => ({
        getBedrockMonitor: vi.fn(() => ({
          trackBedrockRequest: vi.fn(),
          completeBedrockRequest: vi.fn(),
        })),
      })),
    }));

    vi.doMock('../src/middleware/logging.js', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      requestLoggingMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
      errorLoggingMiddleware: (_err: unknown, _req: unknown, _res: unknown, next: (error?: unknown) => void) => next(_err),
    }));

    const securityModule = await import('../src/middleware/security.js');
    const authModule = await import('../src/middleware/authentication.js');
    const completionsModule = await import('../src/routes/completions.js');

    app = express();
    app.use(json({ limit: '10mb' }));
    app.use(securityModule.correlationIdMiddleware);
    app.post(
      '/v1/completions',
      authModule.secureAuthenticationMiddleware,
      completionsModule.completionsHandler(testServerConfig)
    );
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('routes supported aliases to AWS Bedrock when configuration is present', async () => {
    const bedrockResponse = mockResponses.azureResponsesSuccess();
    bedrockResponse.model = 'qwen.qwen3-coder-480b-a35b-v1:0';
    mocks.universalProcessor.processRequest.mockResolvedValueOnce(createBedrockProcessingResult());
    mocks.bedrockClient.createResponse.mockResolvedValueOnce(bedrockResponse);

    const response = await request(app)
      .post('/v1/completions')
      .set('Authorization', `Bearer ${validApiKey}`)
      .send({
        model: 'qwen-3-coder',
        prompt: 'Provide a sample AWS Lambda in TypeScript',
        max_tokens: 256,
      })
      .expect(200);

    expect(response.body.correlationId).toBeDefined();
    expect(mocks.bedrockClient.createResponse).toHaveBeenCalled();
    expect(mocks.azureClient.createResponse).not.toHaveBeenCalled();
  });

  it('simulates streaming responses for Bedrock requests when clients request stream', async () => {
    const bedrockResponse = mockResponses.azureResponsesSuccess();
    bedrockResponse.output = [
      {
        type: 'text',
        text: 'Streaming Bedrock response payload for the client.',
      },
    ];
    mocks.universalProcessor.processRequest.mockResolvedValueOnce(
      createBedrockProcessingResult(true)
    );
    mocks.bedrockClient.createResponse.mockResolvedValueOnce(bedrockResponse);

    const response = await request(app)
      .post('/v1/completions')
      .set('Authorization', `Bearer ${validApiKey}`)
      .send({
        model: 'qwen-3-coder',
        stream: true,
        messages: [{ role: 'user', content: 'Hello Bedrock' }],
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('data:');
    expect(response.text).toContain('[DONE]');
    expect(mocks.bedrockClient.createResponse).toHaveBeenCalled();
  });
});
