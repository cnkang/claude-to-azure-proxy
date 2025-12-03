/**
 * Type definitions for test files to eliminate unsafe `any` usage
 */

import type { ResponsesResponse } from '../../src/types/index';

/**
 * Generic test response body that can be either success or error
 */
export interface TestResponseBody {
  // Claude format responses
  type?: 'message' | 'error';
  id?: string;
  role?: 'assistant';
  content?: Array<{ type: 'text'; text: string }>;
  model?: string;
  stop_reason?: string;
  stop_sequence?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };

  // OpenAI format responses
  object?: 'chat.completion';
  created?: number;
  choices?: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;

  // Error responses
  error?: {
    type: string;
    message: string;
    correlationId?: string;
    timestamp?: string;
  };
}

/**
 * Mock Azure Responses Client interface
 */
export interface MockAzureResponsesClient {
  createResponse: {
    mock: {
      calls: Array<[import('../../src/types/index.js').ResponsesCreateParams]>;
    };
  } & ((
    params: import('../../src/types/index.js').ResponsesCreateParams
  ) => Promise<ResponsesResponse>);

  createResponseStream: {
    mock: {
      calls: Array<[import('../../src/types/index.js').ResponsesCreateParams]>;
    };
  } & ((
    params: import('../../src/types/index.js').ResponsesCreateParams
  ) => AsyncIterable<ResponsesResponse>);
}

/**
 * Mock conversation manager interface
 */
export interface MockConversationManager {
  extractConversationId: {
    mock: {
      calls: Array<[Record<string, string>, string]>;
    };
  } & ((headers: Record<string, string>, correlationId: string) => string);

  getConversationContext: {
    mock: {
      calls: Array<[string]>;
    };
  } & ((
    conversationId: string
  ) => import('../../src/types/index.js').ConversationContext | undefined);

  trackConversation: {
    mock: {
      calls: Array<
        [string, string, import('../../src/types/index.js').ConversationMetrics]
      >;
    };
  } & ((
    conversationId: string,
    responseId: string,
    metrics: import('../../src/types/index.js').ConversationMetrics
  ) => void);

  updateConversationMetrics: {
    mock: {
      calls: Array<
        [
          string,
          Partial<import('../../src/types/index.js').ConversationMetrics>,
        ]
      >;
    };
  } & ((
    conversationId: string,
    updates: Partial<import('../../src/types/index.js').ConversationMetrics>
  ) => void);
}

/**
 * Mock universal request processor interface
 */
export interface MockUniversalRequestProcessor {
  processRequest: {
    mock: {
      calls: Array<
        [
          import('../../src/types/index.js').IncomingRequest,
          import('../../src/types/index.js').ConversationContext | undefined,
        ]
      >;
    };
  } & ((
    request: import('../../src/types/index.js').IncomingRequest,
    context?: import('../../src/types/index.js').ConversationContext
  ) => import(
    '../../src/utils/universal-request-processor.js'
  ).UniversalProcessingResult);
}

/**
 * Mock reasoning analyzer interface
 */
export interface MockReasoningAnalyzer {
  analyzeRequest: {
    mock: {
      calls: Array<
        [
          import('../../src/types/index.js').IncomingRequest,
          import('../../src/types/index.js').ConversationContext | undefined,
        ]
      >;
    };
  } & ((
    request: import('../../src/types/index.js').IncomingRequest,
    context?: import('../../src/types/index.js').ConversationContext
  ) => import('../../src/types/index.js').ReasoningEffort);
}

/**
 * Typed test request interface
 */
export interface TypedTestRequest {
  status: number;
  body: TestResponseBody;
  text: string;
  headers: Record<string, string>;
  get(field: string): string | undefined;
}

/**
 * Express app mock interface
 */
export interface MockExpressApp {
  listen: {
    mock: {
      calls: Array<[number, string, () => void]>;
    };
  } & ((port: number, host: string, callback: () => void) => MockServer);

  use: {
    mock: {
      calls: Array<unknown[]>;
    };
  } & ((...args: unknown[]) => void);

  get: {
    mock: {
      calls: Array<unknown[]>;
    };
  } & ((...args: unknown[]) => void);

  post: {
    mock: {
      calls: Array<unknown[]>;
    };
  } & ((...args: unknown[]) => void);

  set: {
    mock: {
      calls: Array<unknown[]>;
    };
  } & ((...args: unknown[]) => void);

  disable: {
    mock: {
      calls: Array<unknown[]>;
    };
  } & ((...args: unknown[]) => void);
}

/**
 * Mock server interface
 */
export interface MockServer {
  on: {
    mock: {
      calls: Array<[string, (error: Error) => void]>;
    };
  } & ((event: string, callback: (error: Error) => void) => void);

  close: {
    mock: {
      calls: Array<[() => void]>;
    };
  } & ((callback: () => void) => void);
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(
  response: TestResponseBody
): response is TestResponseBody & {
  error: NonNullable<TestResponseBody['error']>;
} {
  return response.error !== undefined;
}

/**
 * Type guard to check if response is Claude format
 */
export function isClaudeResponse(
  response: TestResponseBody
): response is TestResponseBody & { type: 'message' } {
  return response.type === 'message';
}

/**
 * Type guard to check if response is OpenAI format
 */
export function isOpenAIResponse(
  response: TestResponseBody
): response is TestResponseBody & { object: 'chat.completion' } {
  return response.object === 'chat.completion';
}
