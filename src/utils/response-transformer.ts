import {
  AzureOpenAIResponse,
  AzureOpenAIStreamResponse,
  AzureOpenAIError,
  ClaudeCompletionResponse,
  ClaudeStreamResponse,
  ClaudeError,
  ResponseTransformationResult,
  StreamTransformationResult,
  ResponseTransformationError,
  ResponseValidationError,
  ResponseSizeLimits,
  AzureOpenAIResponseTypeGuard,
  AzureOpenAIStreamResponseTypeGuard,
  AzureOpenAIErrorTypeGuard
} from '../types/index.js';

// Default response size limits for security
const DEFAULT_RESPONSE_LIMITS: ResponseSizeLimits = {
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  maxCompletionLength: 100000, // 100k characters
  maxChoicesCount: 10
} as const;

/**
 * Type guard to validate Azure OpenAI response structure
 */
export const isAzureOpenAIResponse: AzureOpenAIResponseTypeGuard = (
  value: unknown
): value is AzureOpenAIResponse => {
  if (!value || typeof value !== 'object') return false;
  
  const response = value as Record<string, unknown>;
  
  return (
    typeof response.id === 'string' &&
    response.object === 'chat.completion' &&
    typeof response.created === 'number' &&
    typeof response.model === 'string' &&
    Array.isArray(response.choices) &&
    response.choices.every(isValidChoice)
  );
};

/**
 * Type guard to validate Azure OpenAI stream response structure
 */
export const isAzureOpenAIStreamResponse: AzureOpenAIStreamResponseTypeGuard = (
  value: unknown
): value is AzureOpenAIStreamResponse => {
  if (!value || typeof value !== 'object') return false;
  
  const response = value as Record<string, unknown>;
  
  return (
    typeof response.id === 'string' &&
    response.object === 'chat.completion.chunk' &&
    typeof response.created === 'number' &&
    typeof response.model === 'string' &&
    Array.isArray(response.choices) &&
    response.choices.every(isValidStreamChoice)
  );
};

/**
 * Type guard to validate Azure OpenAI error response structure
 */
export const isAzureOpenAIError: AzureOpenAIErrorTypeGuard = (
  value: unknown
): value is AzureOpenAIError => {
  if (!value || typeof value !== 'object') return false;
  
  const response = value as Record<string, unknown>;
  
  return Boolean(
    response.error &&
    typeof response.error === 'object' &&
    typeof (response.error as Record<string, unknown>).message === 'string' &&
    typeof (response.error as Record<string, unknown>).type === 'string'
  );
};

/**
 * Validates individual choice in Azure OpenAI response
 */
function isValidChoice(choice: unknown): boolean {
  if (!choice || typeof choice !== 'object') return false;
  
  const c = choice as Record<string, unknown>;
  
  return Boolean(
    typeof c.index === 'number' &&
    c.message &&
    typeof c.message === 'object' &&
    typeof (c.message as Record<string, unknown>).role === 'string' &&
    (typeof (c.message as Record<string, unknown>).content === 'string' ||
     (c.message as Record<string, unknown>).content === null) &&
    (c.finish_reason === null ||
     ['stop', 'length', 'content_filter'].includes(c.finish_reason as string))
  );
}

/**
 * Validates individual choice in Azure OpenAI stream response
 */
function isValidStreamChoice(choice: unknown): boolean {
  if (!choice || typeof choice !== 'object') return false;
  
  const c = choice as Record<string, unknown>;
  
  return Boolean(
    typeof c.index === 'number' &&
    c.delta &&
    typeof c.delta === 'object' &&
    (c.finish_reason === null ||
     ['stop', 'length', 'content_filter'].includes(c.finish_reason as string))
  );
}

/**
 * Validates response size against security limits
 */
function validateResponseSize(
  response: unknown,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS,
  correlationId: string
): void {
  const responseStr = JSON.stringify(response);
  
  if (responseStr.length > limits.maxResponseSize) {
    throw new Error(`Response size ${responseStr.length} exceeds limit ${limits.maxResponseSize}`);
  }
  
  if (isAzureOpenAIResponse(response)) {
    if (response.choices.length > limits.maxChoicesCount) {
      throw new Error(`Choices count ${response.choices.length} exceeds limit ${limits.maxChoicesCount}`);
    }
    
    for (const choice of response.choices) {
      if (choice.message.content && choice.message.content.length > limits.maxCompletionLength) {
        throw new Error(`Completion length ${choice.message.content.length} exceeds limit ${limits.maxCompletionLength}`);
      }
    }
  }
}

/**
 * Sanitizes response content to prevent sensitive data leakage
 */
function sanitizeContent(content: string | null): string {
  if (!content) return '';
  
  // Remove potential sensitive patterns (basic implementation)
  return content
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [TOKEN_REDACTED]')
    .replace(/api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi, 'api_key=[KEY_REDACTED]');
}

/**
 * Maps Azure OpenAI finish reason to Claude format
 */
function mapFinishReason(finishReason: string | null): 'stop_sequence' | 'max_tokens' | null {
  switch (finishReason) {
    case 'stop':
      return 'stop_sequence';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'stop_sequence'; // Map content filter to stop sequence
    default:
      return null;
  }
}

/**
 * Transforms Azure OpenAI response to Claude API format
 */
export function transformAzureResponseToClaude(
  azureResponse: unknown,
  statusCode: number,
  correlationId: string,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS
): ResponseTransformationResult {
  try {
    // Validate response size first
    validateResponseSize(azureResponse, limits, correlationId);
    
    // Handle error responses
    if (isAzureOpenAIError(azureResponse)) {
      const claudeError: ClaudeError = {
        type: 'error',
        error: {
          type: azureResponse.error.type,
          message: sanitizeContent(azureResponse.error.message)
        }
      };
      
      return {
        claudeResponse: claudeError,
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId
        }
      };
    }
    
    // Validate and transform successful response
    if (!isAzureOpenAIResponse(azureResponse)) {
      throw new Error('Invalid Azure OpenAI response structure');
    }
    
    // Extract the first choice (Claude API typically returns single completion)
    const firstChoice = azureResponse.choices[0];
    if (!firstChoice) {
      throw new Error('No choices found in Azure OpenAI response');
    }
    
    const completion = sanitizeContent(firstChoice.message.content);
    
    const claudeResponse: ClaudeCompletionResponse = {
      id: azureResponse.id,
      type: 'completion',
      completion,
      model: 'claude-3-5-sonnet-20241022', // Simulate Claude model
      stop_reason: mapFinishReason(firstChoice.finish_reason),
      usage: azureResponse.usage ? {
        input_tokens: azureResponse.usage.prompt_tokens,
        output_tokens: azureResponse.usage.completion_tokens
      } : undefined
    };
    
    return {
      claudeResponse,
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      }
    };
    
  } catch (error) {
    const transformationError: ResponseTransformationError = {
      type: 'response_transformation_error',
      message: error instanceof Error ? error.message : 'Unknown transformation error',
      code: 'TRANSFORMATION_FAILED',
      originalError: error,
      correlationId
    };
    
    const claudeError: ClaudeError = {
      type: 'error',
      error: {
        type: 'internal_error',
        message: 'Failed to process response'
      }
    };
    
    return {
      claudeResponse: claudeError,
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      }
    };
  }
}

/**
 * Transforms Azure OpenAI stream response to Claude API format
 */
export function transformAzureStreamResponseToClaude(
  azureStreamResponse: unknown,
  correlationId: string
): StreamTransformationResult {
  try {
    if (!isAzureOpenAIStreamResponse(azureStreamResponse)) {
      throw new Error('Invalid Azure OpenAI stream response structure');
    }
    
    const firstChoice = azureStreamResponse.choices[0];
    if (!firstChoice) {
      throw new Error('No choices found in Azure OpenAI stream response');
    }
    
    const content = sanitizeContent(firstChoice.delta.content || '');
    const isComplete = firstChoice.finish_reason !== null;
    
    const claudeStreamResponse: ClaudeStreamResponse = {
      type: 'completion',
      completion: content,
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: mapFinishReason(firstChoice.finish_reason)
    };
    
    return {
      claudeStreamResponse,
      isComplete
    };
    
  } catch (error) {
    // Return empty completion on error to maintain stream integrity
    return {
      claudeStreamResponse: {
        type: 'completion',
        completion: '',
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'stop_sequence'
      },
      isComplete: true
    };
  }
}

/**
 * Validates response data integrity using type narrowing
 */
export function validateResponseIntegrity(
  response: unknown,
  correlationId: string
): response is AzureOpenAIResponse | AzureOpenAIError {
  if (!response || typeof response !== 'object') {
    const error: ResponseValidationError = {
      type: 'response_validation_error',
      message: 'Response is not an object',
      field: 'root',
      value: response,
      correlationId
    };
    throw error;
  }
  
  const responseObj = response as Record<string, unknown>;
  
  // Check for required fields
  if (!responseObj.id || typeof responseObj.id !== 'string') {
    const error: ResponseValidationError = {
      type: 'response_validation_error',
      message: 'Missing or invalid id field',
      field: 'id',
      value: responseObj.id,
      correlationId
    };
    throw error;
  }
  
  // Validate object type
  if (!responseObj.object || typeof responseObj.object !== 'string') {
    const error: ResponseValidationError = {
      type: 'response_validation_error',
      message: 'Missing or invalid object field',
      field: 'object',
      value: responseObj.object,
      correlationId
    };
    throw error;
  }
  
  return isAzureOpenAIResponse(response) || isAzureOpenAIError(response);
}

/**
 * Creates a defensive response handler that gracefully handles malformed responses
 */
export function createDefensiveResponseHandler(
  correlationId: string,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS
) {
  return (azureResponse: unknown, statusCode: number): ResponseTransformationResult => {
    try {
      // First attempt normal transformation
      return transformAzureResponseToClaude(azureResponse, statusCode, correlationId, limits);
    } catch (error) {
      // Fallback to defensive handling
      console.error(`Response transformation failed for correlation ${correlationId}:`, error);
      
      const fallbackError: ClaudeError = {
        type: 'error',
        error: {
          type: 'service_unavailable',
          message: 'The service is temporarily unavailable. Please try again later.'
        }
      };
      
      return {
        claudeResponse: fallbackError,
        statusCode: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Retry-After': '60'
        }
      };
    }
  };
}

/**
 * Utility to extract error information from Azure OpenAI responses
 */
export function extractErrorInfo(azureError: AzureOpenAIError): {
  type: string;
  message: string;
  statusCode: number;
} {
  const errorType = azureError.error.type;
  const errorMessage = sanitizeContent(azureError.error.message);
  
  // Map Azure OpenAI error types to appropriate HTTP status codes
  let statusCode = 500;
  switch (errorType) {
    case 'invalid_request_error':
      statusCode = 400;
      break;
    case 'authentication_error':
      statusCode = 401;
      break;
    case 'permission_error':
      statusCode = 403;
      break;
    case 'not_found_error':
      statusCode = 404;
      break;
    case 'rate_limit_error':
      statusCode = 429;
      break;
    case 'api_error':
    case 'overloaded_error':
      statusCode = 503;
      break;
    default:
      statusCode = 500;
  }
  
  return {
    type: errorType,
    message: errorMessage,
    statusCode
  };
}