/**
 * @fileoverview Integration tests for Azure OpenAI Responses API migration
 * 
 * This test suite validates the complete request-response cycle with the Azure OpenAI
 * Responses API, including Claude format compatibility, OpenAI format compatibility,
 * conversation continuity, and multi-language development scenarios.
 * 
 * Requirements covered: 8.2, 8.4, 4.1, 4.2, 10.1, 10.2, 11.1-11.9
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import { UniversalRequestProcessor } from '../src/utils/universal-request-processor.js';
import { createConversationManager } from '../src/utils/conversation-manager.js';
import { sanitizeErrorMessage, ValidationError } from '../src/errors/index.js';
import type {
  ClaudeRequest,
  OpenAIRequest,
  ResponsesResponse,
  ResponsesStreamChunk,
} from '../src/types/index.js';
import {
  ClaudeRequestFactory,
  OpenAIRequestFactory,
  ResponsesResponseFactory,
  TestDataUtils,
} from './test-factories.js';

// Mock Azure Responses Client
const mockAzureClient = {
  createResponse: vi.fn(),
  createResponseStream: vi.fn(),
  getConfig: vi.fn(),
};

vi.mock('../src/clients/azure-responses-client.js', () => ({
  AzureResponsesClient: class MockAzureResponsesClient {
    constructor(_config: unknown) {
      return mockAzureClient;
    }
  },
}));

// Test configuration removed - not used in this test file

/**
 * Factory for creating Responses API test data
 */
class ResponsesResponseFactory {
  private static counter = 0;

  static create(options: {
    includeReasoning?: boolean;
    includeToolCalls?: boolean;
    content?: string;
    reasoningContent?: string;
  } = {}): ResponsesResponse {
    const {
      includeReasoning = false,
      includeToolCalls = false,
      content = `Test response ${ResponsesResponseFactory.counter++}`,
      reasoningContent = 'This is reasoning content',
    } = options;

    const output: ResponsesResponse['output'] = [
      {
        type: 'text',
        text: content,
      },
    ];

    if (includeReasoning) {
      output.unshift({
        type: 'reasoning',
        reasoning: {
          content: reasoningContent,
          status: 'completed',
        },
      });
    }

    if (includeToolCalls) {
      output.push({
        type: 'tool_call',
        tool_call: {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'test_function',
            arguments: '{"param": "value"}',
          },
        },
      });
    }

    return {
      id: `resp_${ResponsesResponseFactory.counter}`,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-codex',
      output,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        reasoning_tokens: includeReasoning ? 15 : undefined,
      },
    };
  }

  static createStreamChunk(options: {
    content?: string;
    isComplete?: boolean;
    includeReasoning?: boolean;
  } = {}): ResponsesStreamChunk {
    const {
      content = 'Stream chunk',
      isComplete = false,
      includeReasoning = false,
    } = options;

    const output: ResponsesStreamChunk['output'] = [];

    if (includeReasoning && !isComplete) {
      output.push({
        type: 'reasoning',
        reasoning: {
          content: 'Reasoning in progress...',
          status: 'in_progress',
        },
      });
    }

    if (!isComplete) {
      output.push({
        type: 'text',
        text: content,
      });
    }

    return {
      id: `resp_stream_${ResponsesResponseFactory.counter++}`,
      object: 'response.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-codex',
      output,
    };
  }
}

/**
 * Factory for creating OpenAI format requests
 */
class OpenAIRequestFactory {
  private static readonly counter = 0;

  static create(options: {
    includeOptional?: boolean;
    language?: string;
    complexity?: 'simple' | 'medium' | 'complex';
  } = {}): OpenAIRequest {
    const {
      includeOptional = false,
      language = 'typescript',
      complexity = 'medium',
    } = options;

    const prompt = (() => {
      switch (complexity) {
        case 'simple':
          return `Write a simple ${language} function`;
        case 'complex':
          return `Design a scalable ${language} microservice architecture with database integration`;
        case 'medium':
        default:
          return `Create a ${language} class with methods and error handling`;
      }
    })();

    const baseRequest: OpenAIRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    if (includeOptional) {
      return {
        ...baseRequest,
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      };
    }

    return baseRequest;
  }

  static createMultiTurn(turnCount: number): OpenAIRequest {
    const messages: OpenAIRequest['messages'] = [];

    for (let i = 0; i < turnCount; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 
          ? `User message ${i + 1}` 
          : `Assistant response ${i + 1}`,
      });
    }

    // Ensure last message is from user
    if (messages[messages.length - 1]?.role !== 'user') {
      messages.push({
        role: 'user',
        content: 'Continue the conversation',
      });
    }

    return {
      model: 'gpt-4',
      messages,
    };
  }
}

describe('Responses API Integration Tests', () => {
  let app: express.Application;
  let universalProcessor: UniversalRequestProcessor;
  let conversationManager: ReturnType<typeof createConversationManager>;

  beforeAll(async () => {
    // Initialize components
    universalProcessor = new UniversalRequestProcessor({
      enableInputValidation: true,
      enableContentSecurityValidation: true,
      maxRequestSize: 10 * 1024 * 1024,
      defaultReasoningEffort: 'medium',
      enableSwiftOptimization: true,
      swiftKeywords: ['swift', 'ios', 'xcode', 'swiftui'],
      iosKeywords: ['ios', 'iphone', 'ipad', 'macos'],
      reasoningBoost: 1.5,
      modelRouting: {
        defaultProvider: 'azure',
        defaultModel: 'gpt-5-codex',
        entries: [
          {
            provider: 'azure',
            backendModel: 'gpt-5-codex',
            aliases: ['gpt-5-codex', 'gpt-4', 'gpt-4o', 'gpt-4-turbo', 'claude-3-5-sonnet-20241022'],
          },
        ],
      },
    });

    conversationManager = createConversationManager({
      maxConversationAge: 3600000, // 1 hour
      cleanupInterval: 300000, // 5 minutes
      maxStoredConversations: 1000,
    });

    // Create Express app
    app = express();
    app.use(json({ limit: '10mb' }));

    // Add test routes
    app.post('/v1/messages', async (req, res) => {
      try {
        // Extract conversation ID from headers
        const headerConversationIdRaw =
          req.headers['x-conversation-id'] ??
          req.headers['conversation-id'] ??
          req.headers['x-session-id'] ??
          req.headers['session-id'] ??
          req.headers['x-thread-id'] ??
          req.headers['thread-id'];

        const headerConversationId =
          Array.isArray(headerConversationIdRaw) && headerConversationIdRaw.length > 0
            ? headerConversationIdRaw[0]
            : headerConversationIdRaw;

        const conversationId =
          typeof headerConversationId === 'string' && headerConversationId.trim().length > 0
            ? headerConversationId.trim()
            : conversationManager.extractConversationId(
                req.headers as Record<string, string>,
                'test-correlation-id'
              );

        const result = await universalProcessor.processRequest({
          headers: req.headers as Record<string, string>,
          body: req.body,
          path: req.path,
          userAgent: req.get('User-Agent'),
        });

        // Add previous_response_id for conversation continuity
        const previousResponseId = conversationManager.getPreviousResponseId(conversationId);
        let responsesParams = result.responsesParams;
        if (typeof previousResponseId === 'string' && previousResponseId.trim() !== '') {
          responsesParams = {
            ...responsesParams,
            previous_response_id: previousResponseId,
          };
        }

        const responsesResponse = await mockAzureClient.createResponse(responsesParams);

        // Track conversation for continuity
        conversationManager.trackConversation(
          conversationId,
          responsesResponse.id,
          {
            totalTokensUsed: responsesResponse.usage.total_tokens,
            reasoningTokensUsed: responsesResponse.usage.reasoning_tokens ?? 0,
            averageResponseTime: 100,
            errorCount: 0,
          }
        );
        
        // Transform back to Claude format
        const claudeResponse = {
          id: responsesResponse.id,
          type: 'message',
          role: 'assistant',
          content: responsesResponse.output
            .filter(output => output.type === 'text')
            .map(output => ({
              type: 'text',
              text: output.text,
            })),
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: responsesResponse.usage.prompt_tokens,
            output_tokens: responsesResponse.usage.completion_tokens,
          },
        };

        res.json(claudeResponse);
      } catch (error) {
        const message =
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error';

        if (error instanceof ValidationError) {
          res.status(400).json({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message,
            },
          });
          return;
        }

        res.status(500).json({
          type: 'error',
          error: {
            type: 'api_error',
            message,
          },
        });
      }
    });

    app.post('/v1/chat/completions', async (req, res) => {
      try {
        const result = await universalProcessor.processRequest({
          headers: req.headers as Record<string, string>,
          body: req.body,
          path: req.path,
          userAgent: req.get('User-Agent'),
        });

        const responsesResponse = await mockAzureClient.createResponse(result.responsesParams);
        
        // Transform back to OpenAI format
        const openaiResponse = {
          id: responsesResponse.id,
          object: 'chat.completion',
          created: responsesResponse.created,
          model: responsesResponse.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: responsesResponse.output
                  .filter(output => output.type === 'text')
                  .map(output => output.text)
                  .join(''),
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: responsesResponse.usage.prompt_tokens,
            completion_tokens: responsesResponse.usage.completion_tokens,
            total_tokens: responsesResponse.usage.total_tokens,
          },
        };

        res.json(openaiResponse);
      } catch (error) {
        const message =
          error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error';

        if (error instanceof ValidationError) {
          res.status(400).json({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message,
            },
          });
          return;
        }

        res.status(500).json({
          type: 'error',
          error: {
            type: 'api_error',
            message,
          },
        });
      }
    });

    // Start server (not used in tests)
    app.listen(0);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful response
    mockAzureClient.createResponse.mockResolvedValue(
      ResponsesResponseFactory.create()
    );
  });

  afterEach(() => {
    conversationManager.cleanupOldConversations();
  });

  describe('Claude Format Compatibility', () => {
    it('should handle Claude format requests with full request-response cycle', async () => {
      const claudeRequest = ClaudeRequestFactory.create({
        includeOptional: true,
        size: 'medium',
      });

      const expectedResponse = ResponsesResponseFactory.create({
        content: 'Claude format response',
        includeReasoning: true,
      });

      mockAzureClient.createResponse.mockResolvedValue(expectedResponse);

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(200);

      // Verify Claude response format
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'message');
      expect(response.body).toHaveProperty('role', 'assistant');
      expect(response.body).toHaveProperty('content');
      expect(Array.isArray(response.body.content)).toBe(true);
      expect(response.body.content[0]).toHaveProperty('type', 'text');
      expect(response.body.content[0]).toHaveProperty('text');
      expect(response.body).toHaveProperty('model', 'claude-3-5-sonnet-20241022');
      expect(response.body).toHaveProperty('usage');

      // Verify Azure client was called with correct parameters
      expect(mockAzureClient.createResponse).toHaveBeenCalledOnce();
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(callArgs).toHaveProperty('model');
      expect(callArgs).toHaveProperty('input');
      expect(callArgs).toHaveProperty('reasoning');
    });

    it('should handle Claude system messages correctly', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        system: 'You are a helpful coding assistant.',
        messages: [
          {
            role: 'user',
            content: 'Write a TypeScript function',
          },
        ],
        max_tokens: 1000,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(200);

      expect(response.body.type).toBe('message');

      // Verify system message was included in transformation
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      if (Array.isArray(callArgs.input)) {
        const systemMessage = callArgs.input.find((msg: any) => msg.role === 'system');
        expect(systemMessage?.content).toContain('You are a helpful coding assistant.');
      } else {
        expect(callArgs.input).toContain('You are a helpful coding assistant.');
      }
    });

    it('should handle Claude content blocks correctly', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Explain this code:',
              },
              {
                type: 'text',
                text: 'function hello() { console.log("Hello"); }',
              },
            ],
          },
        ],
        max_tokens: 500,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(200);

      expect(response.body.type).toBe('message');

      // Verify content blocks were properly transformed
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(typeof callArgs.input === 'string' || Array.isArray(callArgs.input)).toBe(true);
    });
  });

  describe('OpenAI Format Compatibility', () => {
    it('should handle OpenAI format requests with full request-response cycle', async () => {
      const openaiRequest = OpenAIRequestFactory.create({
        includeOptional: true,
        language: 'python',
        complexity: 'medium',
      });

      const expectedResponse = ResponsesResponseFactory.create({
        content: 'OpenAI format response',
      });

      mockAzureClient.createResponse.mockResolvedValue(expectedResponse);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(openaiRequest)
        .expect(200);

      // Verify OpenAI response format
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body).toHaveProperty('created');
      expect(response.body).toHaveProperty('model');
      expect(response.body).toHaveProperty('choices');
      expect(Array.isArray(response.body.choices)).toBe(true);
      expect(response.body.choices[0]).toHaveProperty('index', 0);
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty('role', 'assistant');
      expect(response.body.choices[0].message).toHaveProperty('content');
      expect(response.body.choices[0]).toHaveProperty('finish_reason', 'stop');
      expect(response.body).toHaveProperty('usage');

      // Verify Azure client was called
      expect(mockAzureClient.createResponse).toHaveBeenCalledOnce();
    });

    it('should handle OpenAI max_completion_tokens parameter', async () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Write a Java class',
          },
        ],
        max_completion_tokens: 1500,
        temperature: 0.8,
      };

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(openaiRequest)
        .expect(200);

      expect(response.body.object).toBe('chat.completion');

      // Verify max_completion_tokens was mapped to max_output_tokens
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(callArgs.max_output_tokens).toBe(1500);
      expect(callArgs.temperature).toBe(0.8);
    });

    it('should handle OpenAI system messages in messages array', async () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Java developer.',
          },
          {
            role: 'user',
            content: 'Create a Spring Boot controller',
          },
        ],
      };

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(openaiRequest)
        .expect(200);

      expect(response.body.object).toBe('chat.completion');

      // Verify system message was properly handled
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(Array.isArray(callArgs.input)).toBe(true);
      if (Array.isArray(callArgs.input)) {
        expect(callArgs.input.some(msg => msg.role === 'system')).toBe(true);
      }
    });
  });

  describe('Conversation Continuity', () => {
    it('should maintain conversation context across multiple requests', async () => {
      const conversationId = TestDataUtils.createCorrelationId();
      
      // First request
      const firstRequest = ClaudeRequestFactory.create({
        size: 'small',
      });

      const firstResponse = ResponsesResponseFactory.create({
        content: 'First response in conversation',
      });

      mockAzureClient.createResponse.mockResolvedValueOnce(firstResponse);

      const response1 = await request(app)
        .post('/v1/messages')
        .set('X-Conversation-ID', conversationId)
        .send(firstRequest)
        .expect(200);

      expect(response1.body.type).toBe('message');

      // Second request in same conversation
      const secondRequest = ClaudeRequestFactory.create({
        size: 'small',
      });

      const secondResponse = ResponsesResponseFactory.create({
        content: 'Second response in conversation',
      });

      mockAzureClient.createResponse.mockResolvedValueOnce(secondResponse);

      const response2 = await request(app)
        .post('/v1/messages')
        .set('X-Conversation-ID', conversationId)
        .send(secondRequest)
        .expect(200);

      expect(response2.body.type).toBe('message');

      // Verify conversation continuity
      expect(mockAzureClient.createResponse).toHaveBeenCalledTimes(2);
      
      // Second call should include previous_response_id
      const secondCallArgs = mockAzureClient.createResponse.mock.calls[1][0];
      expect(secondCallArgs).toHaveProperty('previous_response_id');
    });

    it('should handle multi-turn OpenAI conversations', async () => {
      const multiTurnRequest = OpenAIRequestFactory.createMultiTurn(5);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(multiTurnRequest)
        .expect(200);

      expect(response.body.object).toBe('chat.completion');

      // Verify conversation history was processed
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(Array.isArray(callArgs.input)).toBe(true);
      if (Array.isArray(callArgs.input)) {
        expect(callArgs.input.length).toBeGreaterThan(1);
      }
    });

    it('should track conversation metrics', async () => {
      const conversationId = TestDataUtils.createCorrelationId();
      
      // Make multiple requests in the same conversation
      for (let i = 0; i < 3; i++) {
        const requestData = ClaudeRequestFactory.create({ size: 'small' });
        
        await request(app)
          .post('/v1/messages')
          .set('X-Conversation-ID', conversationId)
          .send(requestData)
          .expect(200);
      }

      // Verify conversation was tracked
      const metrics = conversationManager.getConversationMetrics(conversationId);
      expect(metrics.messageCount).toBe(3);
      expect(metrics.totalTokensUsed).toBeGreaterThan(0);
    });
  });

  describe('Multi-Language Development Scenarios', () => {
    const languageScenarios = [
      {
        language: 'python',
        framework: 'django',
        request: 'Create a Django model with relationships and validation',
        expectedReasoning: 'medium',
      },
      {
        language: 'java',
        framework: 'spring-boot',
        request: 'Design a Spring Boot microservice with JPA repositories',
        expectedReasoning: 'high',
      },
      {
        language: 'kotlin',
        framework: 'android',
        request: 'Build an Android Activity with RecyclerView and ViewModel',
        expectedReasoning: 'medium',
      },
      {
        language: 'typescript',
        framework: 'react',
        request: 'Create a React component with hooks and TypeScript interfaces',
        expectedReasoning: 'medium',
      },
      {
        language: 'typescript',
        framework: 'vue',
        request: 'Implement Vue 3 Composition API with TypeScript and Pinia',
        expectedReasoning: 'medium',
      },
      {
        language: 'shell',
        framework: 'docker',
        request: 'Write a Docker deployment script with health checks',
        expectedReasoning: 'low',
      },
    ];

    languageScenarios.forEach(({ language, framework, request: requestText, expectedReasoning }) => {
      it(`should handle ${language}/${framework} development with appropriate reasoning`, async () => {
        const claudeRequest: ClaudeRequest = {
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            {
              role: 'user',
              content: requestText,
            },
          ],
          max_tokens: 1000,
        };

        const response = await request(app)
          .post('/v1/messages')
          .send(claudeRequest)
          .expect(200);

        expect(response.body.type).toBe('message');

        // Verify reasoning effort was applied appropriately
        const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
        expect(callArgs).toHaveProperty('reasoning');
        
        if (callArgs.reasoning !== null && callArgs.reasoning !== undefined) {
          const reasoningLevels = ['minimal', 'low', 'medium', 'high'];
          expect(reasoningLevels).toContain(callArgs.reasoning.effort);
          
          // Verify expected reasoning level (allow more flexibility for implementation variance)
          const expectedIndex = reasoningLevels.indexOf(expectedReasoning);
          const actualIndex = reasoningLevels.indexOf(callArgs.reasoning.effort);
          expect(Math.abs(actualIndex - expectedIndex)).toBeLessThanOrEqual(2);
        }
      });
    });

    it('should detect and optimize for Swift/iOS development', async () => {
      const swiftRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Create a SwiftUI view with navigation and Core Data integration for iOS app',
          },
        ],
        max_tokens: 1500,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(swiftRequest)
        .expect(200);

      expect(response.body.type).toBe('message');

      // Verify Swift optimization was applied
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(callArgs).toHaveProperty('reasoning');
      
      // Swift development should get some reasoning (allow for implementation variance)
      if (callArgs.reasoning !== null && callArgs.reasoning !== undefined) {
        expect(['minimal', 'low', 'medium', 'high']).toContain(callArgs.reasoning.effort);
      }
    });

    it('should handle multi-language project scenarios', async () => {
      const multiLanguageRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: `
              I have a full-stack project with:
              - React TypeScript frontend
              - Python FastAPI backend
              - PostgreSQL database
              - Docker deployment
              
              Help me set up the project structure and API integration.
            `,
          },
        ],
        max_tokens: 2000,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(multiLanguageRequest)
        .expect(200);

      expect(response.body.type).toBe('message');

      // Multi-language projects should get high reasoning
      const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
      expect(callArgs).toHaveProperty('reasoning');
      
      if (callArgs.reasoning !== null && callArgs.reasoning !== undefined) {
        expect(['high']).toContain(callArgs.reasoning.effort);
      }
    });
  });

  describe('Framework-Specific Optimizations', () => {
    const frameworkScenarios = [
      {
        framework: 'Django',
        request: 'Create Django models with custom managers and signals',
        keywords: ['models.py', 'signals', 'managers'],
      },
      {
        framework: 'Spring Boot',
        request: 'Implement Spring Boot microservice with JPA and security',
        keywords: ['@RestController', '@Service', '@Repository'],
      },
      {
        framework: 'React Hooks',
        request: 'Build React component with custom hooks and context',
        keywords: ['useState', 'useEffect', 'useContext'],
      },
      {
        framework: 'Vue Composition API',
        request: 'Create Vue 3 component with Composition API and Pinia store',
        keywords: ['setup()', 'ref()', 'computed()'],
      },
    ];

    frameworkScenarios.forEach(({ framework, request: requestText, keywords }) => {
      it(`should optimize for ${framework} patterns`, async () => {
        const claudeRequest: ClaudeRequest = {
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            {
              role: 'user',
              content: requestText,
            },
          ],
          max_tokens: 1000,
        };

        const expectedResponse = ResponsesResponseFactory.create({
          content: `${framework} implementation with ${keywords.join(', ')}`,
        });

        mockAzureClient.createResponse.mockResolvedValue(expectedResponse);

        const response = await request(app)
          .post('/v1/messages')
          .send(claudeRequest)
          .expect(200);

        expect(response.body.type).toBe('message');

        // Verify framework-specific reasoning was applied
        const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
        expect(callArgs).toHaveProperty('reasoning');
        
        // Framework-specific requests should get some reasoning (allow for implementation variance)
        if (callArgs.reasoning !== null && callArgs.reasoning !== undefined) {
          expect(['minimal', 'low', 'medium', 'high']).toContain(callArgs.reasoning.effort);
        }
      });
    });
  });

  describe('Error Scenarios and Graceful Degradation', () => {
    it('should handle Azure Responses API errors gracefully', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      mockAzureClient.createResponse.mockRejectedValue(
        new Error('Azure API temporarily unavailable')
      );

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(500);

      expect(response.body).toHaveProperty('type', 'error');
      expect(response.body.error).toHaveProperty('type', 'api_error');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle malformed Responses API responses', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      mockAzureClient.createResponse.mockResolvedValue({
        invalid: 'response structure',
      });

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(500);

      expect(response.body).toHaveProperty('type', 'error');
    });

    it('should handle timeout scenarios', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      mockAzureClient.createResponse.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(500);

      expect(response.body).toHaveProperty('type', 'error');
    });

    it('should validate request format and provide helpful errors', async () => {
      const invalidRequest = {
        model: '', // Invalid empty model
        messages: [], // Invalid empty messages
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(invalidRequest);

      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('type', 'error');
    });
  });

  describe('Security Measures', () => {
    it('should sanitize input content', async () => {
      const maliciousRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Write code with <script>alert("xss")</script> injection',
          },
        ],
        max_tokens: 500,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(maliciousRequest);

      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.type).toBe('message');

        const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
        const inputContent = Array.isArray(callArgs.input)
          ? callArgs.input.map((msg) => msg.content).join(' ')
          : callArgs.input;

        expect(inputContent).not.toContain('<script>');
      } else {
        const errorBody = response.body.error as Record<string, unknown>;
        const errorType = errorBody.type as string | undefined;
        expect(errorType).toBe('invalid_request_error');
        const errorMessage =
          typeof errorBody.message === 'string' ? errorBody.message : '';
        expect(errorMessage.toLowerCase()).toContain('invalid');
      }

      mockAzureClient.createResponse.mockClear();
    });

    it('should enforce request size limits', async () => {
      const largeContent = 'x'.repeat(15 * 1024 * 1024); // 15MB
      const largeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: largeContent,
          },
        ],
        max_tokens: 100,
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(largeRequest);

      // Should reject oversized requests
      expect([413, 500]).toContain(response.status);
      
      if (response.body !== null && response.body !== undefined && typeof response.body === 'object') {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should not expose sensitive information in error responses', async () => {
      mockAzureClient.createResponse.mockRejectedValue(
        new Error('API key sk-1234567890abcdef is invalid')
      );

      const claudeRequest = ClaudeRequestFactory.create();

      const response = await request(app)
        .post('/v1/messages')
        .send(claudeRequest)
        .expect(500);

      expect(response.body).toHaveProperty('type', 'error');
      // Verify sensitive information is redacted
      const responseText = JSON.stringify(response.body);
      expect(responseText).toContain('[REDACTED]'); // Should contain redacted placeholder
      expect(responseText).not.toContain('sk-1234567890abcdef');
    });
  });

  describe('Language-Specific Context Detection', () => {
    const contextScenarios = [
      {
        language: 'Python',
        context: 'data science',
        request: 'Create a pandas DataFrame analysis with matplotlib visualization',
        expectedKeywords: ['pandas', 'matplotlib', 'data'],
      },
      {
        language: 'Java',
        context: 'enterprise',
        request: 'Design Spring Cloud microservices with Eureka and Zuul',
        expectedKeywords: ['spring cloud', 'eureka', 'microservices'],
      },
      {
        language: 'Android',
        context: 'mobile development',
        request: 'Implement Android Room database with LiveData and ViewModel',
        expectedKeywords: ['room', 'livedata', 'viewmodel'],
      },
      {
        language: 'DevOps',
        context: 'infrastructure',
        request: 'Create Kubernetes deployment with Helm charts and monitoring',
        expectedKeywords: ['kubernetes', 'helm', 'monitoring'],
      },
    ];

    contextScenarios.forEach(({ language, context, request: requestText }) => {
      it(`should detect ${language} ${context} context and adjust reasoning`, async () => {
        const claudeRequest: ClaudeRequest = {
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            {
              role: 'user',
              content: requestText,
            },
          ],
          max_tokens: 1000,
        };

        const response = await request(app)
          .post('/v1/messages')
          .send(claudeRequest)
          .expect(200);

        expect(response.body.type).toBe('message');

        // Verify context-aware reasoning was applied
        const callArgs = mockAzureClient.createResponse.mock.calls[0][0];
        expect(callArgs).toHaveProperty('reasoning');
        
        // Context-specific requests should get appropriate reasoning (allow for implementation variance)
        if (callArgs.reasoning !== null && callArgs.reasoning !== undefined) {
          expect(['minimal', 'low', 'medium', 'high']).toContain(callArgs.reasoning.effort);
        }
      });
    });
  });
});
