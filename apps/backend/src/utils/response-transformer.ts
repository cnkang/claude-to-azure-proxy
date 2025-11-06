import type {
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIError,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeError,
  ResponseTransformationResult,
  StreamTransformationResult,
  ResponseValidationError,
  ResponseSizeLimits,
  OpenAIResponseTypeGuard,
  OpenAIStreamResponseTypeGuard,
  OpenAIErrorTypeGuard,
} from '../types/index';
import { ValidationError } from '../errors/index';

const DEFAULT_RESPONSE_LIMITS: ResponseSizeLimits = {
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  maxCompletionLength: 100000,
  maxChoicesCount: 10,
} as const;

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const API_KEY_PATTERN = /api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const sanitizeString = (value: string): string => {
  return value
    .replace(EMAIL_PATTERN, '[EMAIL_REDACTED]')
    .replace(CREDIT_CARD_PATTERN, '[CARD_REDACTED]')
    .replace(SSN_PATTERN, '[SSN_REDACTED]')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [TOKEN_REDACTED]')
    .replace(API_KEY_PATTERN, 'api_key=[KEY_REDACTED]');
};

const sanitizeContent = (content: string | null): string => {
  if (content === null) {
    return '';
  }
  return sanitizeString(content);
};

const isValidFinishReason = (
  value: unknown
): value is 'stop' | 'length' | 'content_filter' | 'tool_calls' | null => {
  return (
    value === null ||
    value === 'stop' ||
    value === 'length' ||
    value === 'content_filter' ||
    value === 'tool_calls'
  );
};

const isValidMessage = (
  value: unknown
): value is { role: string; content: string | null } => {
  if (!isRecord(value)) {
    return false;
  }

  const role = value.role;
  const content = value.content;

  return (
    typeof role === 'string' &&
    (typeof content === 'string' || content === null)
  );
};

const isValidChoice = (choice: unknown): boolean => {
  if (!isRecord(choice)) {
    return false;
  }

  const index = choice.index;
  const message = (choice as { message?: unknown }).message;
  const finishReason = (choice as { finish_reason?: unknown }).finish_reason;

  return (
    typeof index === 'number' &&
    isValidMessage(message) &&
    isValidFinishReason(finishReason)
  );
};

const isValidStreamChoice = (choice: unknown): boolean => {
  if (!isRecord(choice)) {
    return false;
  }

  const index = choice.index;
  const delta = (choice as { delta?: unknown }).delta;
  const finishReason = (choice as { finish_reason?: unknown }).finish_reason;

  if (typeof index !== 'number' || !isRecord(delta)) {
    return false;
  }

  const deltaContent = delta.content;
  const deltaRole = delta.role;

  return (
    isValidFinishReason(finishReason) &&
    (typeof deltaContent === 'undefined' || typeof deltaContent === 'string') &&
    (typeof deltaRole === 'undefined' || deltaRole === 'assistant')
  );
};

export const isAzureOpenAIResponse: OpenAIResponseTypeGuard = (
  value: unknown
): value is OpenAIResponse => {
  if (!isRecord(value)) {
    return false;
  }

  const id = value.id;
  const object = value.object;
  const created = value.created;
  const model = value.model;
  const choices = value.choices;

  if (
    typeof id !== 'string' ||
    object !== 'chat.completion' ||
    typeof created !== 'number' ||
    typeof model !== 'string' ||
    !Array.isArray(choices)
  ) {
    return false;
  }

  return choices.every(isValidChoice);
};

export const isAzureOpenAIStreamResponse: OpenAIStreamResponseTypeGuard = (
  value: unknown
): value is OpenAIStreamChunk => {
  if (!isRecord(value)) {
    return false;
  }

  const id = value.id;
  const object = value.object;
  const created = value.created;
  const model = value.model;
  const choices = value.choices;

  if (
    typeof id !== 'string' ||
    object !== 'chat.completion.chunk' ||
    typeof created !== 'number' ||
    typeof model !== 'string' ||
    !Array.isArray(choices)
  ) {
    return false;
  }

  return choices.every(isValidStreamChoice);
};

export const isAzureOpenAIError: OpenAIErrorTypeGuard = (
  value: unknown
): value is OpenAIError => {
  if (!isRecord(value)) {
    return false;
  }

  const error = (value as { error?: unknown }).error;
  if (!isRecord(error)) {
    return false;
  }

  const message = error.message;
  const type = error.type;

  return typeof message === 'string' && typeof type === 'string';
};

const mapFinishReason = (
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
): 'end_turn' | 'max_tokens' | 'tool_use' | null => {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    default:
      return null;
  }
};

const validateResponseSize = (
  response: unknown,
  limits: ResponseSizeLimits,
  correlationId: string
): void => {
  const serialized = JSON.stringify(response);

  if (serialized.length > limits.maxResponseSize) {
    throw new ValidationError(
      `Response size ${serialized.length} exceeds limit ${limits.maxResponseSize}`,
      correlationId,
      'response_size',
      serialized.length,
      true,
      'response_validation'
    );
  }

  if (!isAzureOpenAIResponse(response)) {
    return;
  }

  if (response.choices.length > limits.maxChoicesCount) {
    throw new ValidationError(
      `Choices count ${response.choices.length} exceeds limit ${limits.maxChoicesCount}`,
      correlationId,
      'choices_count',
      response.choices.length,
      true,
      'response_validation'
    );
  }

  for (const choice of response.choices) {
    const content = choice.message?.content;
    if (
      typeof content === 'string' &&
      content.length > limits.maxCompletionLength
    ) {
      throw new ValidationError(
        `Completion length ${content.length} exceeds limit ${limits.maxCompletionLength}`,
        correlationId,
        'completion_length',
        content.length,
        true,
        'response_validation'
      );
    }
  }
};

class ResponseValidationException
  extends Error
  implements ResponseValidationError
{
  public readonly type = 'response_validation_error';

  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly correlationId: string
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ResponseValidationException';
  }
}

export function transformAzureResponseToOpenAI(
  azureResponse: unknown,
  statusCode: number,
  correlationId: string,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS
): {
  openAIResponse: OpenAIResponse | OpenAIError;
  statusCode: number;
  headers: Record<string, string>;
} {
  try {
    validateResponseSize(azureResponse, limits, correlationId);

    if (isAzureOpenAIError(azureResponse)) {
      const openAIError: OpenAIError = {
        error: {
          message: sanitizeContent(azureResponse.error.message),
          type: azureResponse.error.type,
          code: azureResponse.error.code,
        },
      };

      return {
        openAIResponse: openAIError,
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
        },
      };
    }

    if (!isAzureOpenAIResponse(azureResponse)) {
      throw new ValidationError(
        'Invalid Azure OpenAI response structure',
        correlationId,
        'response_structure',
        azureResponse,
        true,
        'azure_response_validation'
      );
    }

    // For OpenAI format, we can return the Azure response directly since it's already in OpenAI format
    const openAIResponse: OpenAIResponse = {
      id: azureResponse.id,
      object: azureResponse.object,
      created: azureResponse.created,
      model: azureResponse.model,
      choices: azureResponse.choices.map((choice) => ({
        index: choice.index,
        message: choice.message,
        finish_reason: choice.finish_reason,
      })),
      usage: azureResponse.usage,
      system_fingerprint: azureResponse.system_fingerprint,
    };

    return {
      openAIResponse,
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
      },
    };
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error('Unknown transformation error');

    const openAIError: OpenAIError = {
      error: {
        message: 'Failed to process response',
        type: 'api_error',
      },
    };

    return {
      openAIResponse: openAIError,
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Transformation-Error': sanitizeString(failure.message),
      },
    };
  }
}

export function transformAzureResponseToClaude(
  azureResponse: unknown,
  statusCode: number,
  correlationId: string,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS
): ResponseTransformationResult {
  try {
    validateResponseSize(azureResponse, limits, correlationId);

    if (isAzureOpenAIError(azureResponse)) {
      const errorType = azureResponse.error.type;
      let claudeErrorType:
        | 'invalid_request_error'
        | 'authentication_error'
        | 'rate_limit_error'
        | 'api_error';

      switch (errorType) {
        case 'invalid_request_error':
          claudeErrorType = 'invalid_request_error';
          break;
        case 'authentication_error':
          claudeErrorType = 'authentication_error';
          break;
        case 'rate_limit_error':
          claudeErrorType = 'rate_limit_error';
          break;
        default:
          claudeErrorType = 'api_error';
      }

      const claudeError: ClaudeError = {
        type: 'error',
        error: {
          type: claudeErrorType,
          message: sanitizeContent(azureResponse.error.message),
        },
      };

      return {
        claudeResponse: claudeError,
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
        },
      };
    }

    if (!isAzureOpenAIResponse(azureResponse)) {
      throw new ValidationError(
        'Invalid Azure OpenAI response structure',
        correlationId,
        'response_structure',
        azureResponse,
        true,
        'azure_response_validation'
      );
    }

    if (azureResponse.choices.length === 0) {
      throw new ValidationError(
        'No choices found in Azure OpenAI response',
        correlationId,
        'choices_empty',
        azureResponse.choices,
        true,
        'azure_response_validation'
      );
    }

    const firstChoice = azureResponse.choices[0];
    if (!firstChoice) {
      throw new ValidationError(
        'Azure response missing choices',
        correlationId,
        'choices',
        azureResponse.choices
      );
    }

    const completion = sanitizeContent(firstChoice.message?.content ?? null);

    const claudeResponse: ClaudeResponse = {
      id: azureResponse.id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: completion }],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: mapFinishReason(firstChoice.finish_reason),
      usage: {
        input_tokens: azureResponse.usage?.prompt_tokens ?? 0,
        output_tokens: azureResponse.usage?.completion_tokens ?? 0,
      },
    };

    return {
      claudeResponse,
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
      },
    };
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error('Unknown transformation error');

    const claudeError: ClaudeError = {
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to process response',
      },
    };

    return {
      claudeResponse: claudeError,
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Transformation-Error': sanitizeString(failure.message),
      },
    };
  }
}

export function transformAzureStreamResponseToClaude(
  azureStreamResponse: unknown,
  correlationId: string
): StreamTransformationResult {
  if (!isAzureOpenAIStreamResponse(azureStreamResponse)) {
    // Return a default completed response for malformed input
    return {
      isComplete: true,
      claudeStreamResponse: {
        type: 'message_stop',
      },
    };
  }

  if (azureStreamResponse.choices.length === 0) {
    throw new ValidationError(
      'No choices found in Azure OpenAI stream response',
      correlationId,
      'stream_choices_empty',
      azureStreamResponse.choices,
      true,
      'azure_stream_validation'
    );
  }

  const firstChoice = azureStreamResponse.choices[0];
  if (!firstChoice) {
    throw new ValidationError(
      'Azure stream response missing first choice',
      correlationId,
      'choices',
      azureStreamResponse.choices
    );
  }

  const content = sanitizeContent(firstChoice.delta?.content ?? null);
  const isComplete = firstChoice.finish_reason !== null;

  if (isComplete) {
    const claudeStreamResponse: ClaudeStreamChunk = {
      type: 'message_stop',
    };
    return {
      claudeStreamResponse,
      isComplete: true,
    };
  }

  const claudeStreamResponse: ClaudeStreamChunk = {
    type: 'content_block_delta',
    delta: {
      type: 'text_delta',
      text: content,
    },
  };

  return {
    claudeStreamResponse,
    isComplete: false,
  };
}

export function validateResponseIntegrity(
  response: unknown,
  correlationId: string
): response is OpenAIResponse | OpenAIError {
  if (!isRecord(response)) {
    throw new ResponseValidationException(
      'Response is not an object',
      'root',
      response,
      correlationId
    );
  }

  if (typeof response.id !== 'string') {
    throw new ResponseValidationException(
      'Missing or invalid id field',
      'id',
      response.id,
      correlationId
    );
  }

  if (typeof response.object !== 'string') {
    throw new ResponseValidationException(
      'Missing or invalid object field',
      'object',
      response.object,
      correlationId
    );
  }

  return isAzureOpenAIResponse(response) || isAzureOpenAIError(response);
}

export function createDefensiveResponseHandler(
  correlationId: string,
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS,
  onError?: (
    error: Readonly<Error>,
    context: Readonly<{ correlationId: string }>
  ) => void
) {
  return (
    azureResponse: unknown,
    statusCode: number
  ): ResponseTransformationResult => {
    try {
      return transformAzureResponseToClaude(
        azureResponse,
        statusCode,
        correlationId,
        limits
      );
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error('Unknown response transformation failure');

      if (onError) {
        const readonlyFailure: Readonly<Error> = failure;
        onError(readonlyFailure, { correlationId });
      }

      const fallbackError: ClaudeError = {
        type: 'error',
        error: {
          type: 'api_error',
          message:
            'The service is temporarily unavailable. Please try again later.',
        },
      };

      return {
        claudeResponse: fallbackError,
        statusCode: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Retry-After': '60',
        },
      };
    }
  };
}

export function transformAzureResponseByFormat(
  azureResponse: unknown,
  statusCode: number,
  correlationId: string,
  responseFormat: 'claude' | 'openai',
  limits: ResponseSizeLimits = DEFAULT_RESPONSE_LIMITS
): {
  response: ClaudeResponse | ClaudeError | OpenAIResponse | OpenAIError;
  statusCode: number;
  headers: Record<string, string>;
  format: 'claude' | 'openai';
} {
  if (responseFormat === 'openai') {
    const result = transformAzureResponseToOpenAI(
      azureResponse,
      statusCode,
      correlationId,
      limits
    );
    return {
      response: result.openAIResponse,
      statusCode: result.statusCode,
      headers: result.headers,
      format: 'openai',
    };
  } else {
    const result = transformAzureResponseToClaude(
      azureResponse,
      statusCode,
      correlationId,
      limits
    );
    return {
      response: result.claudeResponse,
      statusCode: result.statusCode,
      headers: result.headers,
      format: 'claude',
    };
  }
}

export function createErrorResponseByFormat(
  errorType:
    | 'invalid_request_error'
    | 'authentication_error'
    | 'rate_limit_error'
    | 'api_error',
  message: string,
  statusCode: number,
  correlationId: string,
  responseFormat: 'claude' | 'openai'
): {
  response: ClaudeError | OpenAIError;
  statusCode: number;
  headers: Record<string, string>;
  format: 'claude' | 'openai';
} {
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': correlationId,
  };

  if (responseFormat === 'openai') {
    const openAIError: OpenAIError = {
      error: {
        message: sanitizeContent(message),
        type: errorType,
      },
    };

    return {
      response: openAIError,
      statusCode,
      headers,
      format: 'openai',
    };
  } else {
    const claudeError: ClaudeError = {
      type: 'error',
      error: {
        type: errorType,
        message: sanitizeContent(message),
      },
    };

    return {
      response: claudeError,
      statusCode,
      headers,
      format: 'claude',
    };
  }
}

export function extractErrorInfo(azureError: OpenAIError): {
  type: string;
  message: string;
  statusCode: number;
} {
  const errorType = azureError.error.type;
  const errorMessage = sanitizeContent(azureError.error.message);

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
    statusCode,
  };
}
