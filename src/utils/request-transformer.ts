import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

// Claude API Request Types
export interface ClaudeCompletionRequest {
  readonly model: string;
  readonly prompt: string;
  readonly max_tokens: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly top_k?: number;
  readonly stop_sequences?: readonly string[];
  readonly stream?: boolean;
}

// Azure OpenAI Request Types
export interface AzureOpenAIMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface AzureOpenAIRequest {
  readonly model: string;
  readonly messages: readonly AzureOpenAIMessage[];
  readonly max_tokens: number;
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
const claudeRequestSchema = Joi.object({
  model: Joi.string()
    .required()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9\-_.]+$/)
    .messages({
      'string.pattern.base': 'Model name contains invalid characters',
      'string.min': 'Model name must not be empty',
      'string.max': 'Model name too long'
    }),
  
  prompt: Joi.string()
    .required()
    .min(1)
    .max(8 * 1024 * 1024) // 8MB limit for prompt content
    .messages({
      'string.min': 'Prompt must not be empty',
      'string.max': 'Prompt exceeds maximum length'
    }),
  
  max_tokens: Joi.number()
    .integer()
    .required()
    .min(1)
    .max(131072) // 128K tokens for GPT-5-Codex
    .messages({
      'number.min': 'max_tokens must be at least 1',
      'number.max': 'max_tokens cannot exceed 131072'
    }),
  
  temperature: Joi.number()
    .optional()
    .min(0)
    .max(2)
    .messages({
      'number.min': 'Temperature must be at least 0',
      'number.max': 'Temperature cannot exceed 2'
    }),
  
  top_p: Joi.number()
    .optional()
    .min(0)
    .max(1)
    .messages({
      'number.min': 'top_p must be at least 0',
      'number.max': 'top_p cannot exceed 1'
    }),
  
  top_k: Joi.number()
    .integer()
    .optional()
    .min(1)
    .max(100)
    .messages({
      'number.min': 'top_k must be at least 1',
      'number.max': 'top_k cannot exceed 100'
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
      'array.max': 'Cannot have more than 4 stop sequences'
    }),
  
  stream: Joi.boolean().optional()
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

function sanitizePrompt(prompt: string): string {
  const sanitized = sanitizeString(prompt);
  
  // Check for potential injection patterns
  const suspiciousPatterns = [
    /\{\{.*\}\}/g, // Template injection
    /<script.*?>.*?<\/script>/gi, // Script tags
    /javascript:/gi, // JavaScript protocol
    /data:.*base64/gi, // Data URLs
    /\bon\w+\s*=/gi // Event handlers
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      throw new SecurityError('Prompt contains potentially malicious content');
    }
  }
  
  return sanitized;
}

// Validation Function
export function validateClaudeRequest(request: unknown): ClaudeCompletionRequest {
  const { error, value } = claudeRequestSchema.validate(request);
  
  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    
    throw new ValidationError('Request validation failed', details);
  }
  
  // Additional security validation
  const validatedRequest = value as ClaudeCompletionRequest;
  
  // Sanitize prompt
  const sanitizedPrompt = sanitizePrompt(validatedRequest.prompt);
  
  return {
    ...validatedRequest,
    prompt: sanitizedPrompt
  };
}

// Request Transformation
export function transformClaudeToAzureRequest(
  claudeRequest: ClaudeCompletionRequest,
  azureModel: string
): AzureOpenAIRequest {
  // Convert prompt to messages format
  const messages: AzureOpenAIMessage[] = [
    {
      role: 'user',
      content: claudeRequest.prompt
    }
  ];

  // Map parameters
  const azureRequest: AzureOpenAIRequest = {
    model: azureModel,
    messages,
    max_tokens: claudeRequest.max_tokens,
    user: uuidv4() // Add user ID for tracking
  };

  // Optional parameters - using object spread to maintain type safety
  const optionalParams: Partial<AzureOpenAIRequest> = {};

  if (claudeRequest.temperature !== undefined) {
    (optionalParams as { temperature: number }).temperature = claudeRequest.temperature;
  }

  if (claudeRequest.top_p !== undefined) {
    (optionalParams as { top_p: number }).top_p = claudeRequest.top_p;
  }

  if (claudeRequest.stop_sequences && claudeRequest.stop_sequences.length > 0) {
    (optionalParams as { stop: readonly string[] }).stop = claudeRequest.stop_sequences;
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
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    throw new SecurityError('Invalid Azure OpenAI API key');
  }

  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
    'User-Agent': 'claude-to-azure-proxy/1.0.0',
    'X-Request-ID': requestId || uuidv4()
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
    const azureRequest = transformClaudeToAzureRequest(claudeRequest, azureModel);
    
    // Create headers
    const requestId = uuidv4();
    const headers = createAzureHeaders(azureApiKey, requestId);
    
    return {
      azureRequest,
      headers,
      requestId
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
