import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

// Claude API Request Types
export interface ClaudeCompletionRequest {
  readonly model: string;
  readonly prompt: string;
  readonly max_tokens?: number; // Optional - Azure OpenAI will use model defaults if not specified
  readonly temperature?: number;
  readonly top_p?: number;
  readonly top_k?: number;
  readonly stop_sequences?: readonly string[];
  readonly stream?: boolean;
}

// Claude content block for rich content
export interface ClaudeContentBlock {
  readonly type: 'text';
  readonly text: string;
}

// Claude Chat Completions Request Types (modern format)
export interface ClaudeChatMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string | readonly ClaudeContentBlock[];
}

export interface ClaudeChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly ClaudeChatMessage[];
  readonly max_tokens?: number; // Optional - Azure OpenAI will use model defaults if not specified
  readonly temperature?: number;
  readonly top_p?: number;
  readonly top_k?: number;
  readonly stop_sequences?: readonly string[];
  readonly stream?: boolean;
}

// Union type for both request formats
export type ClaudeRequest =
  | ClaudeCompletionRequest
  | ClaudeChatCompletionRequest;

// Azure OpenAI Request Types
export interface AzureOpenAIMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface AzureOpenAIRequest {
  readonly model: string;
  readonly messages: readonly AzureOpenAIMessage[];
  readonly max_completion_tokens?: number; // Optional for Chat Completions API
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stop?: readonly string[];
  readonly stream?: boolean;
  readonly user?: string;
}

// Request Headers
export interface AzureOpenAIHeaders {
  readonly 'Content-Type': 'application/json';
  readonly 'api-key': string;
  readonly 'User-Agent': string;
  readonly 'X-Request-ID': string;
}

// Validation Schemas
const baseRequestSchema = {
  model: Joi.string()
    .required()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9\-_.]+$/)
    .messages({
      'string.pattern.base': 'Model name contains invalid characters',
      'string.min': 'Model name must not be empty',
      'string.max': 'Model name too long',
    }),

  max_tokens: Joi.number()
    .integer()
    .optional() // Make it optional - Azure OpenAI will use model defaults if not specified
    .min(1)
    .max(131072) // 128K tokens for GPT-5-Codex
    .messages({
      'number.min': 'max_tokens must be at least 1',
      'number.max': 'max_tokens cannot exceed 131072',
    }),

  temperature: Joi.number().optional().min(0).max(2).messages({
    'number.min': 'Temperature must be at least 0',
    'number.max': 'Temperature cannot exceed 2',
  }),

  top_p: Joi.number().optional().min(0).max(1).messages({
    'number.min': 'top_p must be at least 0',
    'number.max': 'top_p cannot exceed 1',
  }),

  top_k: Joi.number().integer().optional().min(1).max(100).messages({
    'number.min': 'top_k must be at least 1',
    'number.max': 'top_k cannot exceed 100',
  }),

  stop_sequences: Joi.array()
    .items(
      Joi.string()
        .min(1)
        .max(20)
        .pattern(/^[^\x00-\x1F\x7F]*$/) // No control characters
    )
    .optional()
    .max(4)
    .messages({
      'array.max': 'Cannot have more than 4 stop sequences',
    }),

  stream: Joi.boolean().optional(),
};

// Legacy completions format schema
const claudeCompletionSchema = Joi.object({
  ...baseRequestSchema,
  prompt: Joi.string()
    .required()
    .min(1)
    .max(8 * 1024 * 1024) // 8MB limit for prompt content
    .messages({
      'string.min': 'Prompt must not be empty',
      'string.max': 'Prompt exceeds maximum length',
    }),
})
  .required()
  .options({ stripUnknown: true, abortEarly: false });

// Content block schema for Claude API format
const contentBlockSchema = Joi.object({
  type: Joi.string().valid('text').required(),
  text: Joi.string()
    .allow('')
    .optional()
    .max(8 * 1024 * 1024) // 8MB limit per text block
    .default('[Content was sanitized and removed for security]')
    .messages({
      'string.max': 'Text content exceeds maximum length',
    }),
});

// Modern chat completions format schema
const claudeChatCompletionSchema = Joi.object({
  ...baseRequestSchema,
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant', 'system').required(),
        content: Joi.alternatives()
          .try(
            // String format (simple text)
            Joi.string()
              .allow('')
              .max(8 * 1024 * 1024) // 8MB limit per message
              .default('[Content was sanitized and removed for security]')
              .messages({
                'string.max': 'Message content exceeds maximum length',
              }),
            // Array format (content blocks)
            Joi.array()
              .items(contentBlockSchema)
              .min(1)
              .max(20) // Reasonable limit on content blocks
              .messages({
                'array.min': 'At least one content block is required',
                'array.max': 'Too many content blocks in message',
              })
          )
          .required(),
      })
    )
    .required()
    .min(1)
    .max(100) // Reasonable limit on conversation length
    .messages({
      'array.min': 'At least one message is required',
      'array.max': 'Too many messages in conversation',
    }),
})
  .required()
  .options({ stripUnknown: true, abortEarly: false });

// Error Classes
export class RequestTransformationError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'RequestTransformationError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends RequestTransformationError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends RequestTransformationError {
  constructor(message: string, details?: unknown) {
    super(message, 'SECURITY_ERROR', details);
    this.name = 'SecurityError';
  }
}

// Input Sanitization
function sanitizeString(input: string): string {
  // Remove null bytes and control characters except newlines and tabs
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Content conversion helper
function convertContentToString(
  content: string | readonly ClaudeContentBlock[]
): string {
  if (typeof content === 'string') {
    return content;
  }

  // Convert content blocks to a single string
  return content.map((block) => block.text).join('\n');
}

function sanitizePrompt(prompt: string): string {
  const sanitized = sanitizeString(prompt);

  // Check for potential injection patterns
  const suspiciousPatterns = [
    // More specific template injection patterns that are actually malicious
    /\{\{\s*(constructor|__proto__|prototype)\s*\}\}/gi,
    /\{\{\s*.*\s*(eval|Function|require|import|process|global)\s*.*\s*\}\}/gi,
    /<script.*?>.*?<\/script>/gi, // Script tags
    /(?:^|\s)javascript:\s*/gi, // More specific - only match javascript: protocol at start or after whitespace
    /data:.*base64/gi, // Data URLs
    /\s+on(click|load|error|focus|blur|change|submit|keydown|keyup|mouseover|mouseout)\s*=/gi, // HTML event handlers only
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      throw new SecurityError('Prompt contains potentially malicious content');
    }
  }

  return sanitized;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null;
};

const isClaudeCompletionPayload = (
  value: unknown
): value is ClaudeCompletionRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.prompt === 'string' &&
    (value.max_tokens === undefined || typeof value.max_tokens === 'number')
  );
};

const isClaudeChatCompletionPayload = (
  value: unknown
): value is ClaudeChatCompletionRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.messages) &&
    value.messages.every(
      (message) =>
        isRecord(message) &&
        typeof message.role === 'string' &&
        (typeof message.content === 'string' ||
          (Array.isArray(message.content) &&
            message.content.every(
              (block) =>
                isRecord(block) &&
                block.type === 'text' &&
                typeof block.text === 'string'
            )))
    ) &&
    (value.max_tokens === undefined || typeof value.max_tokens === 'number')
  );
};

const assertClaudeCompletionRequest = (
  value: unknown
): ClaudeCompletionRequest => {
  if (!isClaudeCompletionPayload(value)) {
    throw new ValidationError('Invalid completion request structure');
  }

  return value;
};

const assertClaudeChatCompletionRequest = (
  value: unknown
): ClaudeChatCompletionRequest => {
  if (!isClaudeChatCompletionPayload(value)) {
    throw new ValidationError('Invalid chat completion request structure');
  }

  return value;
};

// Validation Function
export function validateClaudeRequest(request: unknown): ClaudeRequest {
  // Try to determine the request format
  const requestRecord = isRecord(request) ? request : undefined;
  const requestWithMessages = requestRecord as
    | (UnknownRecord & { messages?: unknown })
    | undefined;
  const requestWithPrompt = requestRecord as
    | (UnknownRecord & { prompt?: unknown })
    | undefined;

  const hasMessages = Array.isArray(requestWithMessages?.messages);
  const hasPrompt = typeof requestWithPrompt?.prompt === 'string';

  let validationResult:
    | Joi.ValidationResult<ClaudeChatCompletionRequest>
    | Joi.ValidationResult<ClaudeCompletionRequest>;
  let requestType: 'completion' | 'chat';

  if (hasMessages && !hasPrompt) {
    // Chat completions format
    validationResult = claudeChatCompletionSchema.validate(
      request
    ) as Joi.ValidationResult<ClaudeChatCompletionRequest>;
    requestType = 'chat';
  } else if (hasPrompt && !hasMessages) {
    // Legacy completions format
    validationResult = claudeCompletionSchema.validate(
      request
    ) as Joi.ValidationResult<ClaudeCompletionRequest>;
    requestType = 'completion';
  } else {
    throw new ValidationError(
      'Request must have either "prompt" or "messages" field, but not both'
    );
  }

  const validationError = validationResult.error;

  if (validationError) {
    const details = validationError.details.map((detail) => {
      const context = detail.context as Record<string, unknown> | undefined;
      const contextValue = context !== undefined ? context.value : undefined;

      return {
        field: detail.path.join('.'),
        message: detail.message,
        value: contextValue,
      };
    });

    throw new ValidationError('Request validation failed', details);
  }

  // Additional security validation and sanitization
  if (requestType === 'completion') {
    const validatedRequest = assertClaudeCompletionRequest(
      validationResult.value
    );
    const sanitizedPrompt = sanitizePrompt(validatedRequest.prompt);

    return {
      ...validatedRequest,
      prompt: sanitizedPrompt,
    };
  } else {
    const validatedRequest = assertClaudeChatCompletionRequest(
      validationResult.value
    );
    const sanitizedMessages = validatedRequest.messages.map((message) => {
      if (typeof message.content === 'string') {
        return {
          ...message,
          content: sanitizePrompt(message.content),
        };
      } else {
        // Handle content blocks
        const sanitizedBlocks = message.content.map((block) => ({
          ...block,
          text: sanitizePrompt(block.text),
        }));
        return {
          ...message,
          content: sanitizedBlocks,
        };
      }
    });

    return {
      ...validatedRequest,
      messages: sanitizedMessages,
    };
  }
}

// Request Transformation
export function transformClaudeToAzureRequest(
  claudeRequest: ClaudeRequest,
  azureModel: string
): AzureOpenAIRequest {
  let messages: AzureOpenAIMessage[];

  // Handle both request formats
  if ('prompt' in claudeRequest) {
    // Legacy completions format - convert prompt to messages
    messages = [
      {
        role: 'user',
        content: claudeRequest.prompt,
      },
    ];
  } else {
    // Modern chat completions format - use messages directly
    messages = claudeRequest.messages.map((message) => ({
      role: message.role,
      content: convertContentToString(message.content),
    }));
  }

  // Map parameters
  const azureRequest: AzureOpenAIRequest = {
    model: azureModel,
    messages,
    user: uuidv4(), // Add user ID for tracking
  };

  // Optional parameters - using object spread to maintain type safety
  const optionalParams: Partial<AzureOpenAIRequest> = {};

  // Only include max_completion_tokens if max_tokens was specified in the original request
  if (claudeRequest.max_tokens !== undefined) {
    (
      optionalParams as { max_completion_tokens: number }
    ).max_completion_tokens = claudeRequest.max_tokens;
  }

  if (claudeRequest.temperature !== undefined) {
    (optionalParams as { temperature: number }).temperature =
      claudeRequest.temperature;
  }

  if (claudeRequest.top_p !== undefined) {
    (optionalParams as { top_p: number }).top_p = claudeRequest.top_p;
  }

  if ((claudeRequest.stop_sequences?.length ?? 0) > 0) {
    (optionalParams as { stop: readonly string[] }).stop =
      claudeRequest.stop_sequences!;
  }

  if (claudeRequest.stream !== undefined) {
    (optionalParams as { stream: boolean }).stream = claudeRequest.stream;
  }

  return { ...azureRequest, ...optionalParams };
}

// Headers Creation
export function createAzureHeaders(
  apiKey: string,
  requestId?: string
): AzureOpenAIHeaders {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new SecurityError('Invalid Azure OpenAI API key');
  }

  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
    'User-Agent': 'claude-to-azure-proxy/2.0.0',
    'X-Request-ID': requestId ?? uuidv4(),
  };
}

// Request Size Validation
export function validateRequestSize(request: unknown): void {
  const requestString = JSON.stringify(request);
  const sizeInBytes = Buffer.byteLength(requestString, 'utf8');

  // 10MB limit
  const maxSizeBytes = 10 * 1024 * 1024;

  if (sizeInBytes > maxSizeBytes) {
    throw new ValidationError(
      `Request size ${sizeInBytes} bytes exceeds maximum allowed size ${maxSizeBytes} bytes`
    );
  }
}

// Main transformation function
export function transformRequest(
  rawRequest: unknown,
  azureModel: string,
  azureApiKey: string
): {
  readonly azureRequest: AzureOpenAIRequest;
  readonly headers: AzureOpenAIHeaders;
  readonly requestId: string;
} {
  try {
    // Validate request size first
    validateRequestSize(rawRequest);

    // Validate and sanitize the Claude request
    const claudeRequest = validateClaudeRequest(rawRequest);

    // Transform to Azure format
    const azureRequest = transformClaudeToAzureRequest(
      claudeRequest,
      azureModel
    );

    // Create headers
    const requestId = uuidv4();
    const headers = createAzureHeaders(azureApiKey, requestId);

    return {
      azureRequest,
      headers,
      requestId,
    };
  } catch (error) {
    if (error instanceof RequestTransformationError) {
      throw error;
    }

    throw new RequestTransformationError(
      'Unexpected error during request transformation',
      'TRANSFORMATION_ERROR',
      error
    );
  }
}
