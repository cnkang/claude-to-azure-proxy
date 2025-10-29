import { v4 as uuidv4 } from 'uuid';

import { ValidationError } from '../errors/index.js';
import type {
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
} from '../types/index.js';
import { isResponsesResponse, isResponsesStreamChunk } from '../types/index.js';

/**
 * Validate Responses API create parameters using shared rules.
 *
 * @param params - Parameters to validate
 * @throws {ValidationError} When validation fails
 */
export function validateResponsesCreateParams<T extends ResponsesCreateParams>(
  params: Readonly<T>
): void {
  const correlationId = uuidv4();

  if (!params.model || typeof params.model !== 'string') {
    throw new ValidationError(
      'Invalid model: must be a non-empty string',
      correlationId,
      'model',
      params.model,
      true,
      'validateResponsesCreateParams'
    );
  }

  if (typeof params.input === 'string') {
    if (params.input.length === 0) {
      throw new ValidationError(
        'Invalid input: string input cannot be empty',
        correlationId,
        'input',
        '[EMPTY_STRING]',
        true,
        'validateResponsesCreateParams'
      );
    }
  } else if (Array.isArray(params.input)) {
    if (params.input.length === 0) {
      throw new ValidationError(
        'Invalid input: message array cannot be empty',
        correlationId,
        'input',
        '[EMPTY_ARRAY]',
        true,
        'validateResponsesCreateParams'
      );
    }

    for (const [index, message] of params.input.entries()) {
      if (typeof message !== 'object' || message === null) {
        throw new ValidationError(
          `Invalid message at index ${index}: must be an object`,
          correlationId,
          `input[${index}]`,
          message,
          true,
          'validateResponsesCreateParams'
        );
      }

      const messageObj = message as Record<string, unknown>;

      if (
        typeof messageObj.role !== 'string' ||
        !['user', 'assistant', 'system'].includes(messageObj.role)
      ) {
        throw new ValidationError(
          `Invalid message role at index ${index}: must be user, assistant, or system`,
          correlationId,
          `input[${index}].role`,
          messageObj.role,
          true,
          'validateResponsesCreateParams'
        );
      }

      if (
        typeof messageObj.content !== 'string' ||
        messageObj.content.length === 0
      ) {
        throw new ValidationError(
          `Invalid message content at index ${index}: must be a non-empty string`,
          correlationId,
          `input[${index}].content`,
          messageObj.content,
          true,
          'validateResponsesCreateParams'
        );
      }
    }
  } else {
    throw new ValidationError(
      'Invalid input: must be a string or array of messages',
      correlationId,
      'input',
      typeof params.input,
      true,
      'validateResponsesCreateParams'
    );
  }

  if (
    params.max_output_tokens !== undefined &&
    (typeof params.max_output_tokens !== 'number' ||
      params.max_output_tokens <= 0)
  ) {
    throw new ValidationError(
      'Invalid max_output_tokens: must be a positive number',
      correlationId,
      'max_output_tokens',
      params.max_output_tokens,
      true,
      'validateResponsesCreateParams'
    );
  }

  if (
    params.temperature !== undefined &&
    (typeof params.temperature !== 'number' ||
      params.temperature < 0 ||
      params.temperature > 2)
  ) {
    throw new ValidationError(
      'Invalid temperature: must be a number between 0 and 2',
      correlationId,
      'temperature',
      params.temperature,
      true,
      'validateResponsesCreateParams'
    );
  }

  if (
    params.top_p !== undefined &&
    (typeof params.top_p !== 'number' || params.top_p < 0 || params.top_p > 1)
  ) {
    throw new ValidationError(
      'Invalid top_p: must be a number between 0 and 1',
      correlationId,
      'top_p',
      params.top_p,
      true,
      'validateResponsesCreateParams'
    );
  }

  if (
    params.reasoning !== undefined &&
    (typeof params.reasoning.effort !== 'string' ||
      !['minimal', 'low', 'medium', 'high'].includes(params.reasoning.effort))
  ) {
    throw new ValidationError(
      'Invalid reasoning effort: must be minimal, low, medium, or high',
      correlationId,
      'reasoning.effort',
      params.reasoning.effort,
      true,
      'validateResponsesCreateParams'
    );
  }
}

/**
 * Ensures the response matches the Responses API format.
 *
 * @param response - Value to validate
 * @param correlationId - Optional correlation ID for error reporting
 * @returns Validated ResponsesResponse
 * @throws {ValidationError} When validation fails
 */
export function assertValidResponsesResponse(
  response: unknown,
  correlationId?: string
): ResponsesResponse {
  const safeCorrelationId = correlationId ?? uuidv4();

  if (!isResponsesResponse(response)) {
    throw new ValidationError(
      'Invalid API response format',
      safeCorrelationId,
      'response',
      typeof response,
      true,
      'assertValidResponsesResponse'
    );
  }

  return response;
}

/**
 * Ensures the streaming chunk matches the Responses API format.
 *
 * @param chunk - Chunk to validate
 * @param correlationId - Optional correlation ID for error reporting
 * @returns Validated ResponsesStreamChunk
 * @throws {ValidationError} When validation fails
 */
export function assertValidResponsesStreamChunk(
  chunk: unknown,
  correlationId?: string
): ResponsesStreamChunk {
  const safeCorrelationId = correlationId ?? uuidv4();

  if (!isResponsesStreamChunk(chunk)) {
    throw new ValidationError(
      'Invalid streaming response chunk format',
      safeCorrelationId,
      'chunk',
      typeof chunk,
      true,
      'assertValidResponsesStreamChunk'
    );
  }

  return chunk;
}
