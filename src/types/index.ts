// Core TypeScript interfaces for the application
import { Request, Response, NextFunction } from 'express';

export interface ServerConfig {
  readonly port: number;
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly proxyApiKey: string;
  readonly azureOpenAI?: {
    readonly endpoint: string;
    readonly apiKey: string;
    readonly model: string;
  };
}

export interface HealthCheckResult {
  readonly status: 'healthy' | 'unhealthy';
  readonly timestamp: string;
  readonly uptime: number;
  readonly memory: {
    readonly used: number;
    readonly total: number;
    readonly percentage: number;
  };
  readonly azureOpenAI?: {
    readonly status: 'connected' | 'disconnected';
    readonly responseTime?: number;
  };
}

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

export interface ErrorResponse {
  readonly error: {
    readonly type: string;
    readonly message: string;
    readonly correlationId: string;
  };
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly message: string;
}

export interface SecurityHeaders {
  readonly contentSecurityPolicy: string;
  readonly strictTransportSecurity: string;
  readonly xFrameOptions: string;
  readonly xContentTypeOptions: string;
  readonly referrerPolicy: string;
}

// Authentication types
export enum AuthenticationResult {
  SUCCESS = 'success',
  MISSING_CREDENTIALS = 'missing_credentials',
  INVALID_CREDENTIALS = 'invalid_credentials',
  RATE_LIMITED = 'rate_limited',
}

export enum AuthenticationMethod {
  BEARER_TOKEN = 'bearer_token',
  API_KEY_HEADER = 'api_key_header',
}

export interface AuthenticationRequest extends RequestWithCorrelationId {
  authMethod?: AuthenticationMethod;
  authResult?: AuthenticationResult;
}

export interface AuthenticationError {
  readonly type: string;
  readonly message: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

export interface AuthenticationResponse {
  readonly error: AuthenticationError;
}

// Request transformation types
export interface TransformationResult {
  readonly azureRequest: unknown;
  readonly headers: Record<string, string>;
  readonly requestId: string;
}

export interface TransformationError {
  readonly type: string;
  readonly message: string;
  readonly code: string;
  readonly details?: unknown;
  readonly correlationId: string;
}

// Azure OpenAI Response Types
export interface AzureOpenAIChoice {
  readonly index: number;
  readonly message: {
    readonly role: 'assistant' | 'user' | 'system';
    readonly content: string | null;
  };
  readonly finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface AzureOpenAIUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface AzureOpenAIResponse {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly AzureOpenAIChoice[];
  readonly usage?: AzureOpenAIUsage;
  readonly system_fingerprint?: string;
}

export interface AzureOpenAIStreamChoice {
  readonly index: number;
  readonly delta: {
    readonly role?: 'assistant';
    readonly content?: string;
  };
  readonly finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface AzureOpenAIStreamResponse {
  readonly id: string;
  readonly object: 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly AzureOpenAIStreamChoice[];
  readonly system_fingerprint?: string;
}

export interface AzureOpenAIError {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly param?: string;
    readonly code?: string;
  };
}

// Claude API Response Types
export interface ClaudeCompletionResponse {
  readonly id: string;
  readonly type: 'completion';
  readonly completion: string;
  readonly model: string;
  readonly stop_reason: 'stop_sequence' | 'max_tokens' | null;
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

export interface ClaudeStreamResponse {
  readonly type: 'completion';
  readonly completion: string;
  readonly model: string;
  readonly stop_reason: 'stop_sequence' | 'max_tokens' | null;
  readonly log_id?: string;
}

export interface ClaudeError {
  readonly type: 'error';
  readonly error: {
    readonly type: string;
    readonly message: string;
  };
}

// Response transformation types
export interface ResponseTransformationResult {
  readonly claudeResponse: ClaudeCompletionResponse | ClaudeError;
  readonly statusCode: number;
  readonly headers: Record<string, string>;
}

export interface StreamTransformationResult {
  readonly claudeStreamResponse: ClaudeStreamResponse;
  readonly isComplete: boolean;
}

export interface ResponseTransformationError {
  readonly type: 'response_transformation_error';
  readonly message: string;
  readonly code: string;
  readonly originalError?: unknown;
  readonly correlationId: string;
}

export interface ResponseValidationError {
  readonly type: 'response_validation_error';
  readonly message: string;
  readonly field: string;
  readonly value: unknown;
  readonly correlationId: string;
}

// Response size limits
export interface ResponseSizeLimits {
  readonly maxResponseSize: number;
  readonly maxCompletionLength: number;
  readonly maxChoicesCount: number;
}

// Type guards for response validation
export type AzureOpenAIResponseTypeGuard = (
  value: unknown
) => value is AzureOpenAIResponse;
export type AzureOpenAIStreamResponseTypeGuard = (
  value: unknown
) => value is AzureOpenAIStreamResponse;
export type AzureOpenAIErrorTypeGuard = (
  value: unknown
) => value is AzureOpenAIError;

// Express middleware types
export type AsyncMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type ErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void;
