/**
 * Typed mock utilities to eliminate unsafe any usage in tests.
 * Provides strongly typed mock implementations for all external dependencies.
 */

import { vi, type MockedFunction } from 'vitest';
import type {
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
  ConversationContext,
  ConversationMetrics,
  IncomingRequest,
  ReasoningEffort,
} from '../../src/types/index.js';
import type { UniversalProcessingResult } from '../../src/utils/universal-request-processor.js';

type CreateResponseFn = (params: ResponsesCreateParams) => Promise<ResponsesResponse>;
type CreateResponseStreamFn = (
  params: ResponsesCreateParams
) => AsyncIterable<ResponsesStreamChunk>;

export interface TypedAzureResponsesClientMock {
  readonly createResponse: MockedFunction<CreateResponseFn>;
  readonly createResponseStream: MockedFunction<CreateResponseStreamFn>;
}

export function createMockAzureResponsesClient(): TypedAzureResponsesClientMock {
  const createResponse = vi.fn<CreateResponseFn>();
  const createResponseStream = vi.fn<CreateResponseStreamFn>();

  return {
    createResponse,
    createResponseStream,
  };
}

type ExtractConversationIdFn = (
  headers: Record<string, string>,
  correlationId: string
) => string;
type GetConversationContextFn = (conversationId: string) => ConversationContext | undefined;
type GetPreviousResponseIdFn = (conversationId: string) => string | undefined;
type TrackConversationFn = (
  conversationId: string,
  responseId: string,
  metrics?: Partial<ConversationMetrics>
) => void;
type UpdateConversationMetricsFn = (
  conversationId: string,
  metrics: Partial<ConversationMetrics>
) => void;

export interface TypedConversationManagerMock {
  readonly extractConversationId: MockedFunction<ExtractConversationIdFn>;
  readonly getConversationContext: MockedFunction<GetConversationContextFn>;
  readonly getPreviousResponseId: MockedFunction<GetPreviousResponseIdFn>;
  readonly trackConversation: MockedFunction<TrackConversationFn>;
  readonly updateConversationMetrics: MockedFunction<UpdateConversationMetricsFn>;
}

export function createMockConversationManager(): TypedConversationManagerMock {
  const extractConversationId = vi.fn<ExtractConversationIdFn>();
  const getConversationContext = vi.fn<GetConversationContextFn>();
  const getPreviousResponseId = vi.fn<GetPreviousResponseIdFn>();
  const trackConversation = vi.fn<TrackConversationFn>();
  const updateConversationMetrics = vi.fn<UpdateConversationMetricsFn>();

  return {
    extractConversationId,
    getConversationContext,
    getPreviousResponseId,
    trackConversation,
    updateConversationMetrics,
  };
}

type ProcessRequestFn = (
  request: IncomingRequest,
  context: ConversationContext | undefined
) => Promise<UniversalProcessingResult>;

export interface TypedUniversalRequestProcessorMock {
  readonly processRequest: MockedFunction<ProcessRequestFn>;
}

export function createMockUniversalRequestProcessor(): TypedUniversalRequestProcessorMock {
  const processRequest = vi.fn<ProcessRequestFn>();

  return {
    processRequest,
  };
}

type AnalyzeRequestFn = (
  request: IncomingRequest,
  context: ConversationContext | undefined
) => ReasoningEffort;

export interface TypedReasoningAnalyzerMock {
  readonly analyzeRequest: MockedFunction<AnalyzeRequestFn>;
}

export function createMockReasoningAnalyzer(): TypedReasoningAnalyzerMock {
  const analyzeRequest = vi.fn<AnalyzeRequestFn>();

  return {
    analyzeRequest,
  };
}

type CircuitBreakerExecuteFn = (
  operation: () => Promise<unknown>,
  correlationId: string,
  operationName: string
) => Promise<{ success: boolean; data?: unknown; error?: Error }>;

export interface TypedCircuitBreakerMock {
  readonly execute: MockedFunction<CircuitBreakerExecuteFn>;
}

export function createMockCircuitBreaker(): TypedCircuitBreakerMock {
  const execute = vi.fn<CircuitBreakerExecuteFn>();

  return {
    execute,
  };
}

type RetryExecuteFn = (
  operation: () => Promise<unknown>,
  correlationId: string,
  operationName: string
) => Promise<{ success: boolean; data?: unknown; error?: Error }>;

export interface TypedRetryStrategyMock {
  readonly execute: MockedFunction<RetryExecuteFn>;
}

export function createMockRetryStrategy(): TypedRetryStrategyMock {
  const execute = vi.fn<RetryExecuteFn>();

  return {
    execute,
  };
}

interface GracefulDegradationArgs {
  readonly correlationId: string;
  readonly operation: string;
  readonly error: Error;
  readonly attempt: number;
  readonly metadata?: Record<string, unknown>;
}

type ExecuteGracefulDegradationFn = (
  args: GracefulDegradationArgs
) => Promise<{ success: boolean; data?: unknown; fallbackUsed?: string; degraded?: boolean }>;

export interface TypedGracefulDegradationManagerMock {
  readonly executeGracefulDegradation: MockedFunction<ExecuteGracefulDegradationFn>;
}

export function createMockGracefulDegradationManager(): TypedGracefulDegradationManagerMock {
  const executeGracefulDegradation = vi.fn<ExecuteGracefulDegradationFn>();

  return {
    executeGracefulDegradation,
  };
}

export const mockResponses = {
  azureResponsesSuccess: (): ResponsesResponse => ({
    id: 'test-response-id',
    object: 'responses.response',
    created: Date.now(),
    model: 'gpt-4-test-deployment',
    output: [
      {
        type: 'text',
        text: 'This is a test response from Azure OpenAI.',
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 15,
      total_tokens: 25,
      reasoning_tokens: 5,
    },
  }),
  conversationContext: (): ConversationContext => ({
    totalTokensUsed: 100,
    reasoningTokensUsed: 20,
    averageResponseTime: 1500,
    errorCount: 0,
  }),
  universalProcessingResult: (): UniversalProcessingResult => ({
    requestFormat: 'claude',
    responseFormat: 'claude',
    conversationId: 'test-conversation-id',
    estimatedComplexity: 'medium',
    reasoningEffort: 'medium',
    responsesParams: {
      model: 'gpt-4-test-deployment',
      input: 'Test input message',
      reasoning: {
        effort: 'medium',
      },
    },
  }),
} as const;

export function setupAllMocks(): {
  azureClient: TypedAzureResponsesClientMock;
  conversationManager: TypedConversationManagerMock;
  universalProcessor: TypedUniversalRequestProcessorMock;
  reasoningAnalyzer: TypedReasoningAnalyzerMock;
  circuitBreaker: TypedCircuitBreakerMock;
  retryStrategy: TypedRetryStrategyMock;
  gracefulDegradation: TypedGracefulDegradationManagerMock;
} {
  const azureClient = createMockAzureResponsesClient();
  const conversationManager = createMockConversationManager();
  const universalProcessor = createMockUniversalRequestProcessor();
  const reasoningAnalyzer = createMockReasoningAnalyzer();
  const circuitBreaker = createMockCircuitBreaker();
  const retryStrategy = createMockRetryStrategy();
  const gracefulDegradation = createMockGracefulDegradationManager();

  azureClient.createResponse.mockResolvedValue(mockResponses.azureResponsesSuccess());
  conversationManager.extractConversationId.mockReturnValue('test-conversation-id');
  conversationManager.getConversationContext.mockReturnValue(mockResponses.conversationContext());
  conversationManager.getPreviousResponseId.mockReturnValue(undefined);
  universalProcessor.processRequest.mockResolvedValue(mockResponses.universalProcessingResult());
  reasoningAnalyzer.analyzeRequest.mockReturnValue('medium');

  circuitBreaker.execute.mockImplementation(async (fn) => {
    const result = await fn();
    return { success: true, data: result };
  });

  retryStrategy.execute.mockImplementation(async (fn) => {
    const result = await fn();
    return { success: true, data: result };
  });

  gracefulDegradation.executeGracefulDegradation.mockResolvedValue({ success: false });

  return {
    azureClient,
    conversationManager,
    universalProcessor,
    reasoningAnalyzer,
    circuitBreaker,
    retryStrategy,
    gracefulDegradation,
  };
}
