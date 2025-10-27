/**
 * @fileoverview Integration tests for AWS Bedrock model routing and end-to-end flows.
 *
 * This test suite validates the complete request flow from client to Bedrock and back,
 * including model routing, streaming response handling, and error scenarios.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import {
  UniversalRequestProcessor,
  createUniversalRequestProcessor,
  type UniversalProcessorConfig,
} from '../src/utils/universal-request-processor.js';
import { AWSBedrockClient } from '../src/clients/aws-bedrock-client.js';
import type {
  IncomingRequest,
  ClaudeRequest,
  AWSBedrockConfig,
  ResponsesCreateParams,
} from '../src/types/index.js';

// Mock configuration with Bedrock enabled
vi.mock('../src/config/index.js', () => ({
  default: {
    PROXY_API_KEY: 'test-api-key-12345678901234567890123456789012',
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-azure-key-12345678901234567890123456789012',
    AZURE_OPENAI_MODEL: 'gpt-5-codex',
    AWS_BEDROCK_API_KEY: 'test-bedrock-key-12345678901234567890123456789012',
    AWS_BEDROCK_REGION: 'us-west-2',
    AWS_BEDROCK_TIMEOUT: 30000,
    AWS_BEDROCK_MAX_RETRIES: 3,
    PORT: 3000,
    NODE_ENV: 'test',
  },
  isAWSBedrockConfigured: vi.fn(() => true),
  createAWSBedrockConfig: vi.fn(() => ({
    baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
    apiKey: 'test-bedrock-key-12345678901234567890123456789012',
    region: 'us-west-2',
    timeout: 30000,
    maxRetries: 3,
  })),
}));

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock rate limiting middleware
vi.mock('express-rate-limit', () => {
  return {
    default: vi.fn(
      () =>
        (
          req: express.Request,
          res: express.Response,
          next: express.NextFunction
        ) =>
          next()
    ),
  };
});

// Mock health monitor
vi.mock('../src/monitoring/health-monitor.ts', () => {
  const mockHealthMonitor = {
    getHealthStatus: vi.fn().mockResolvedValue({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 1000,
      memory: { used: 100, total: 1000, percentage: 10 },
      azureOpenAI: { status: 'connected', responseTime: 100 },
      awsBedrock: { status: 'connected', responseTime: 120 },
    }),
  };

  return {
    HealthMonitor: vi.fn().mockImplementation(() => mockHealthMonitor),
    healthMonitor: mockHealthMonitor,
  };
});

describe('Bedrock Integration Tests', () => {
  let processor: UniversalRequestProcessor;
  let bedrockClient: AWSBedrockClient;
  let mockAxiosInstance: ReturnType<typeof vi.mocked>;

  beforeEach(() => {
    // Create mock axios instance
    mockAxiosInstance = vi.mocked({
      post: vi.fn(),
      create: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    });

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Create Bedrock client
    const bedrockConfig: AWSBedrockConfig = {
      baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
      apiKey: 'test-bedrock-key-12345678901234567890123456789012',
      region: 'us-west-2',
      timeout: 30000,
      maxRetries: 3,
    };

    bedrockClient = new AWSBedrockClient(bedrockConfig);

    // Create processor with Bedrock routing
    const config: UniversalProcessorConfig = {
      maxRequestSize: 1024 * 1024,
      modelRouting: {
        defaultProvider: 'azure',
        defaultModel: 'gpt-5-codex',
        entries: [
          {
            provider: 'azure',
            backendModel: 'gpt-5-codex',
            aliases: ['gpt-5-codex', 'gpt-4', 'claude-3-5-sonnet-20241022'],
          },
          {
            provider: 'bedrock',
            backendModel: 'qwen.qwen3-coder-480b-a35b-v1:0',
            aliases: ['qwen-3-coder', 'qwen.qwen3-coder-480b-a35b-v1:0'],
          },
        ],
      },
    };

    processor = createUniversalRequestProcessor(config);

    vi.clearAllMocks();
  });

  describe('Model Routing', () => {
    it('should route qwen-3-coder requests to Bedrock provider', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'qwen-3-coder',
        messages: [
          {
            role: 'user',
            content: 'Write a simple Python function',
          },
        ],
        max_tokens: 1000,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
        userAgent: 'claude-client/1.0',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.requestFormat).toBe('claude');
      expect(result.responseFormat).toBe('claude');
      expect(result.responsesParams.model).toBe('qwen.qwen3-coder-480b-a35b-v1:0'); // Backend model ID
      expect(result.responsesParams.input).toBe('Write a simple Python function');
      expect(result.responsesParams.max_output_tokens).toBe(1000);
      expect(result.correlationId).toMatch(/^req_[a-f0-9-]+$/);
    });

    it('should route full Bedrock model ID to Bedrock provider', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        messages: [
          {
            role: 'user',
            content: 'Explain recursion',
          },
        ],
        max_tokens: 500,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
        userAgent: 'claude-client/1.0',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.requestFormat).toBe('claude');
      expect(result.responseFormat).toBe('claude');
      expect(result.responsesParams.model).toBe('qwen.qwen3-coder-480b-a35b-v1:0');
      expect(result.responsesParams.input).toBe('Explain recursion');
      expect(result.responsesParams.max_output_tokens).toBe(500);
    });

    it('should route gpt models to Azure provider (not Bedrock)', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'gpt-5-codex',
        messages: [
          {
            role: 'user',
            content: 'Hello Azure',
          },
        ],
        max_tokens: 100,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
        userAgent: 'claude-client/1.0',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.requestFormat).toBe('claude');
      expect(result.responseFormat).toBe('claude');
      expect(result.responsesParams.model).toBe('gpt-5-codex'); // Azure model
      expect(result.responsesParams.input).toBe('Hello Azure');
      expect(result.responsesParams.max_output_tokens).toBe(100);
    });

    it('should handle unsupported model with appropriate error', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'unsupported-model-xyz',
        messages: [
          {
            role: 'user',
            content: 'Test unsupported model',
          },
        ],
        max_tokens: 100,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
        userAgent: 'claude-client/1.0',
      };

      try {
        await processor.processRequest(incomingRequest);
        expect.fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Unsupported model "unsupported-model-xyz"');
      }
    });
  });

  describe('Streaming Response Handling', () => {
    it('should handle Bedrock streaming responses with proper cleanup', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Write a function',
        max_output_tokens: 500,
        stream: true,
      };

      // Mock streaming response
      const mockStreamChunks = [
        {
          messageStart: { role: 'assistant' },
        },
        {
          contentBlockDelta: {
            delta: { text: 'def ' },
          },
        },
        {
          contentBlockDelta: {
            delta: { text: 'my_function():' },
          },
        },
        {
          messageStop: {
            stopReason: 'end_turn',
          },
          metadata: {
            usage: {
              inputTokens: 10,
              outputTokens: 15,
              totalTokens: 25,
            },
          },
        },
      ];

      // Mock stream response
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockStreamChunks) {
            yield Buffer.from(JSON.stringify(chunk) + '\n');
          }
        },
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockStream,
      });

      const chunks = [];
      for await (const chunk of bedrockClient.createResponseStream(params)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].object).toBe('response.chunk');
      expect(chunks[0].model).toBe('qwen.qwen3-coder-480b-a35b-v1:0');

      // Verify streaming endpoint was called
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('/converse-stream'),
        expect.any(Object),
        expect.objectContaining({
          responseType: 'stream',
          headers: expect.objectContaining({
            'Accept': 'application/vnd.amazon.eventstream',
          }),
        })
      );
    });

    it('should handle streaming connection interruptions gracefully', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Test streaming error',
        stream: true,
      };

      // Mock streaming error
      const streamError = new Error('Connection interrupted');
      (streamError as any).code = 'ECONNRESET';

      mockAxiosInstance.post.mockRejectedValue(streamError);

      await expect(async () => {
        for await (const chunk of bedrockClient.createResponseStream(params)) {
          // Should not reach here
        }
      }).rejects.toThrow();
    });
  });

  describe('Error Scenarios and Fallback Behavior', () => {
    it('should handle Bedrock API errors with proper error transformation', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Test error handling',
        max_output_tokens: 100,
      };

      // Mock Bedrock API error
      const bedrockError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid request parameters',
              type: 'ValidationException',
            },
          },
        },
        message: 'Request failed with status code 400',
      };

      mockAxiosInstance.post.mockRejectedValue(bedrockError);

      await expect(bedrockClient.createResponse(params)).rejects.toThrow();
    });

    it('should handle Bedrock service unavailable errors', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Test service unavailable',
        max_output_tokens: 100,
      };

      // Mock service unavailable error
      const serviceError = {
        isAxiosError: true,
        response: {
          status: 503,
          data: {
            error: {
              message: 'Service temporarily unavailable',
              type: 'ServiceUnavailableException',
            },
          },
        },
        message: 'Request failed with status code 503',
      };

      mockAxiosInstance.post.mockRejectedValue(serviceError);

      await expect(bedrockClient.createResponse(params)).rejects.toThrow();
    });

    it('should handle timeout errors with proper retry logic', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Test timeout',
        max_output_tokens: 100,
      };

      // Mock timeout error
      const timeoutError = new Error('timeout of 30000ms exceeded');
      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      await expect(bedrockClient.createResponse(params)).rejects.toThrow();
    });
  });

  describe('End-to-End Request Flow Validation', () => {
    it('should maintain Claude API compatibility throughout Bedrock flow', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant',
          },
          {
            role: 'user',
            content: 'Write a hello world function in Python',
          },
        ],
        max_output_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
        stop: ['END'],
      };

      // Mock comprehensive Bedrock response
      const mockBedrockResponse = {
        responseId: 'bedrock-e2e-test',
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                text: 'def hello_world():\n    """A simple hello world function"""\n    print("Hello, World!")\n\n# Call the function\nhello_world()',
              },
            ],
          },
        },
        stopReason: 'end_turn',
        usage: {
          inputTokens: 25,
          outputTokens: 45,
          totalTokens: 70,
        },
        metrics: {
          latencyMs: 1500,
        },
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockBedrockResponse,
      });

      const response = await bedrockClient.createResponse(params);

      // Validate Responses API response format
      expect(response).toMatchObject({
        id: 'bedrock-e2e-test',
        object: 'response',
        created: expect.any(Number),
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        output: [
          {
            type: 'text',
            text: expect.stringContaining('def hello_world()'),
          },
        ],
        usage: {
          prompt_tokens: 25,
          completion_tokens: 45,
          total_tokens: 70,
        },
      });

      // Verify request transformation to Bedrock format
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('/model/qwen.qwen3-coder-480b-a35b-v1:0/converse'),
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: [{ text: 'Write a hello world function in Python' }],
            },
          ],
          system: [
            { text: 'You are a helpful coding assistant' },
          ],
          inferenceConfig: {
            maxTokens: 200,
            temperature: 0.7,
            topP: 0.9,
            stopSequences: ['END'],
          },
        })
      );
    });

    it('should handle tool use in end-to-end flow', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'What is the weather like in San Francisco?',
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state',
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
        tool_choice: 'auto',
      };

      // Mock Bedrock response with tool use
      const mockBedrockResponse = {
        responseId: 'bedrock-tool-test',
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'tool-call-123',
                  name: 'get_weather',
                  input: { location: 'San Francisco, CA' },
                },
              },
            ],
          },
        },
        stopReason: 'tool_use',
        usage: {
          inputTokens: 30,
          outputTokens: 20,
          totalTokens: 50,
        },
        metrics: {
          latencyMs: 900,
        },
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockBedrockResponse,
      });

      const response = await bedrockClient.createResponse(params);

      expect(response.output).toEqual([
        {
          type: 'tool_call',
          tool_call: {
            id: 'tool-call-123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: JSON.stringify({ location: 'San Francisco, CA' }),
            },
          },
        },
      ]);

      // Verify tool configuration was properly transformed
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          toolConfig: {
            tools: [
              {
                toolSpec: {
                  name: 'get_weather',
                  description: 'Get current weather for a location',
                  inputSchema: {
                    json: expect.objectContaining({
                      type: 'object',
                      properties: expect.any(Object),
                    }),
                  },
                },
              },
            ],
            toolChoice: { auto: {} },
          },
        })
      );
    });
  });
});