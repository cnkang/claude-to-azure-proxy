// Core TypeScript interfaces for the application
import { Request, Response, NextFunction } from 'express';
import type { Readable } from 'node:stream';

export interface ServerConfig {
  readonly port: number;
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly proxyApiKey: string;
  readonly azureOpenAI?: {
    readonly endpoint?: string;
    readonly baseURL?: string;
    readonly apiKey: string;
    readonly apiVersion?: string;
    readonly model?: string;
    readonly deployment?: string;
    readonly timeout?: number | string;
    readonly maxRetries?: number | string;
  };
}

// Azure OpenAI v1 Responses API Configuration
export interface AzureOpenAIConfig {
  readonly baseURL: string; // https://RESOURCE-NAME.openai.azure.com/openai/v1/
  readonly apiKey: string;
  readonly apiVersion?: string; // Optional: "preview" for legacy API, empty/undefined for GA v1 API
  readonly deployment: string; // GPT-5-Codex deployment name
  readonly timeout: number;
  readonly maxRetries: number;
}

// AWS Bedrock Configuration
export interface AWSBedrockConfig {
  readonly baseURL: string; // https://bedrock-runtime.{region}.amazonaws.com
  readonly apiKey: string;
  readonly region: string; // AWS region (e.g., us-west-2)
  readonly timeout: number;
  readonly maxRetries: number;
}

export type ModelProvider = 'azure' | 'bedrock';

export interface ModelRoutingEntry {
  readonly provider: ModelProvider;
  readonly backendModel: string;
  readonly aliases: readonly string[];
  readonly capabilities?: readonly string[];
}

export interface ModelRoutingConfig {
  readonly defaultProvider: ModelProvider;
  readonly defaultModel: string;
  readonly entries: readonly ModelRoutingEntry[];
}

export interface ModelRoutingDecision {
  readonly provider: ModelProvider;
  readonly requestedModel: string;
  readonly backendModel: string;
  readonly isSupported: boolean;
}

// AWS Bedrock Converse API Types
export interface BedrockConverseRequest {
  readonly messages: readonly BedrockMessage[];
  readonly inferenceConfig?: {
    readonly maxTokens?: number;
    readonly temperature?: number;
    readonly topP?: number;
    readonly stopSequences?: readonly string[];
  };
  readonly system?: readonly BedrockSystemMessage[];
  readonly toolConfig?: BedrockToolConfig;
}

export interface BedrockMessage {
  readonly role: 'user' | 'assistant';
  readonly content: readonly BedrockContentBlock[];
}

export interface BedrockContentBlock {
  readonly text?: string;
  readonly toolUse?: BedrockToolUse;
  readonly toolResult?: BedrockToolResult;
}

export interface BedrockSystemMessage {
  readonly text: string;
}

export interface BedrockToolConfig {
  readonly tools?: readonly BedrockTool[];
  readonly toolChoice?: BedrockToolChoice;
}

export interface BedrockTool {
  readonly toolSpec: {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: {
      readonly json: JsonSchema;
    };
  };
}

export interface BedrockToolChoice {
  readonly auto?: Record<string, never>;
  readonly any?: Record<string, never>;
  readonly tool?: {
    readonly name: string;
  };
}

export interface BedrockToolUse {
  readonly toolUseId: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface BedrockToolResult {
  readonly toolUseId: string;
  readonly content: readonly BedrockContentBlock[];
  readonly status?: 'success' | 'error';
}

export interface BedrockConverseResponse {
  readonly responseId: string;
  readonly output: {
    readonly message: BedrockMessage;
  };
  readonly stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  readonly usage: BedrockUsage;
  readonly metrics?: BedrockMetrics;
}

export interface BedrockStreamChunk {
  readonly messageStart?: { readonly role: 'assistant' };
  readonly contentBlockStart?: {
    readonly start: { readonly toolUse?: BedrockToolUse };
  };
  readonly contentBlockDelta?: {
    readonly delta: { readonly text?: string };
  };
  readonly contentBlockStop?: { readonly contentBlockIndex: number };
  readonly messageStop?: { readonly stopReason: string };
  readonly metadata?: {
    readonly usage?: BedrockUsage;
    readonly metrics?: BedrockMetrics;
  };
  readonly message?: BedrockMessage;
}

export interface BedrockUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly invocationLatency?: number;
  readonly firstByteLatency?: number;
}

export interface BedrockMetrics {
  readonly latencyMs: number;
}

export type BedrockStream = Readable & AsyncIterable<Buffer | string>;

// Responses API Types
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface ResponsesCreateParams {
  readonly model: string;
  readonly input: string | readonly ResponseMessage[];
  readonly max_output_tokens?: number;
  readonly reasoning?: {
    readonly effort: ReasoningEffort;
  };
  readonly stream?: boolean;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stop?: readonly string[];
  readonly previous_response_id?: string;
  readonly tools?: readonly ResponsesTool[];
  readonly tool_choice?:
    | 'auto'
    | 'none'
    | {
        readonly type: 'function';
        readonly function: { readonly name: string };
      };
  readonly response_format?: {
    readonly type: 'text' | 'json_object' | 'json_schema';
    readonly json_schema?: JsonSchema;
  };
}

export interface ResponseMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface ResponsesTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonSchema;
  };
}

export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
}

export interface ResponsesResponse {
  readonly id: string;
  readonly object: 'response';
  readonly created: number;
  readonly model: string;
  readonly output: readonly ResponseOutput[];
  readonly usage: ResponseUsage;
}

export interface ResponseOutput {
  readonly type: 'text' | 'reasoning' | 'tool_call' | 'tool_result';
  readonly text?: string;
  readonly reasoning?: {
    readonly content: string;
    readonly status: 'in_progress' | 'completed';
  };
  readonly tool_call?: ResponsesToolCall;
  readonly tool_result?: {
    readonly tool_call_id: string;
    readonly content: string;
    readonly is_error?: boolean;
  };
}

export interface ResponseUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
  readonly reasoning_tokens?: number;
}

export interface ResponsesToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface ResponsesStreamChunk {
  readonly id: string;
  readonly object: 'response.chunk';
  readonly created: number;
  readonly model: string;
  readonly output: readonly ResponseOutput[];
  readonly usage?: ResponseUsage;
}

// Client Detection Types
export type ClientType =
  | 'claude-code-cli'
  | 'xcode-coding-assistant'
  | 'openai-compatible'
  | 'unknown';
export type RequestFormat = 'claude' | 'openai';
export type ResponseFormat = 'claude' | 'openai';

/**
 * Deep readonly utility type for ESLint prefer-readonly-parameter-types compliance
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends Record<string, unknown>
    ? DeepReadonly<T[P]>
    : T[P] extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T[P];
};

export interface IncomingRequest {
  readonly headers: DeepReadonly<Record<string, string>>;
  readonly body: unknown;
  readonly path: string;
  readonly userAgent?: string;
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
  readonly awsBedrock?: {
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

export interface RequestTransformationError {
  readonly type: 'request_transformation_error';
  readonly message: string;
  readonly code: string;
  readonly details?: unknown;
  readonly correlationId: string;
}

// OpenAI API Compatibility Models (for Xcode 26)
export interface OpenAIRequest {
  readonly model: string;
  readonly messages: readonly OpenAIMessage[];
  readonly max_tokens?: number;
  readonly max_completion_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stream?: boolean;
  readonly tools?: readonly OpenAIToolDefinition[];
  readonly tool_choice?:
    | 'auto'
    | 'none'
    | {
        readonly type: 'function';
        readonly function: { readonly name: string };
      };
  readonly response_format?: {
    readonly type: 'text' | 'json_object';
  };
}

export interface OpenAIMessage {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string | null;
  readonly tool_calls?: readonly OpenAIToolCall[];
  readonly tool_call_id?: string;
  readonly name?: string;
}

export interface OpenAIToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonSchema;
  };
}

export interface OpenAIToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface OpenAIResponse {
  readonly id: string;
  readonly object: 'chat.completion' | 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly OpenAIChoice[];
  readonly usage?: OpenAIUsage;
  readonly system_fingerprint?: string;
}

export interface OpenAIChoice {
  readonly index: number;
  readonly message?: OpenAIMessage;
  readonly delta?: Partial<OpenAIMessage>;
  readonly finish_reason:
    | 'stop'
    | 'length'
    | 'content_filter'
    | 'tool_calls'
    | null;
}

export interface OpenAIUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface OpenAIStreamChunk {
  readonly id: string;
  readonly object: 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly OpenAIChoice[];
  readonly system_fingerprint?: string;
}

export interface OpenAIError {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly param?: string;
    readonly code?: string;
  };
}

// Claude API Compatibility Models
export interface ClaudeRequest {
  readonly model: string;
  readonly messages: readonly ClaudeMessage[];
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stream?: boolean;
  readonly system?: string;
  readonly stop_sequences?: readonly string[];
  readonly tools?: readonly ClaudeToolDefinition[];
  readonly tool_choice?:
    | 'auto'
    | 'any'
    | { readonly type: 'tool'; readonly name: string };
}

export interface ClaudeMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string | readonly ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  readonly type: 'text' | 'image' | 'tool_use' | 'tool_result';
  readonly text?: string;
  readonly source?: {
    readonly type: 'base64';
    readonly media_type: string;
    readonly data: string;
  };
  readonly id?: string;
  readonly name?: string;
  readonly input?: Record<string, unknown>;
  readonly tool_use_id?: string;
  readonly content?: string | readonly ClaudeContentBlock[];
  readonly is_error?: boolean;
}

export interface ClaudeToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: JsonSchema;
}

export interface ClaudeToolCall {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ClaudeToolResult {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string | readonly ClaudeContentBlock[];
  readonly is_error?: boolean;
}

export interface ClaudeResponse {
  readonly id: string;
  readonly type: 'message';
  readonly role: 'assistant';
  readonly content: readonly ClaudeContentBlock[];
  readonly model: string;
  readonly stop_reason:
    | 'end_turn'
    | 'max_tokens'
    | 'stop_sequence'
    | 'tool_use'
    | null;
  readonly stop_sequence?: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

export interface ClaudeStreamChunk {
  readonly type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'error';
  readonly message?: Partial<ClaudeResponse>;
  readonly index?: number;
  readonly content_block?: ClaudeContentBlock;
  readonly delta?: {
    readonly type?: string;
    readonly text?: string;
    readonly stop_reason?: string;
    readonly stop_sequence?: string;
  };
  readonly error?: {
    readonly type: string;
    readonly message: string;
  };
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

export interface ClaudeError {
  readonly type: 'error';
  readonly error: {
    readonly type:
      | 'invalid_request_error'
      | 'authentication_error'
      | 'rate_limit_error'
      | 'api_error'
      | 'overloaded_error';
    readonly message: string;
  };
}

// Response transformation types
export interface ResponseTransformationResult {
  readonly claudeResponse: ClaudeResponse | ClaudeError;
  readonly statusCode: number;
  readonly headers: Record<string, string>;
}

export interface OpenAIResponseTransformationResult {
  readonly openAIResponse: OpenAIResponse | OpenAIError;
  readonly statusCode: number;
  readonly headers: Record<string, string>;
}

export interface UnifiedResponseTransformationResult {
  readonly response:
    | ClaudeResponse
    | ClaudeError
    | OpenAIResponse
    | OpenAIError;
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly format: ResponseFormat;
}

export interface StreamTransformationResult {
  readonly claudeStreamResponse: ClaudeStreamChunk;
  readonly isComplete: boolean;
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
export type OpenAIResponseTypeGuard = (
  value: unknown
) => value is OpenAIResponse;
export type OpenAIStreamResponseTypeGuard = (
  value: unknown
) => value is OpenAIStreamChunk;
export type OpenAIErrorTypeGuard = (value: unknown) => value is OpenAIError;

// Universal Models for Internal Processing
export type UniversalRequest = ClaudeRequest | OpenAIRequest;
export type UniversalResponse = ClaudeResponse | OpenAIResponse;
export type UniversalStreamChunk = ClaudeStreamChunk | OpenAIStreamChunk;

// Error Types and Mapping
export interface ResponsesAPIError {
  readonly type:
    | 'invalid_request'
    | 'authentication'
    | 'rate_limit'
    | 'server_error';
  readonly code: string;
  readonly message: string;
  readonly param?: string;
}

export interface AzureOpenAIErrorResponse {
  readonly error?: {
    readonly type?: string;
    readonly message?: string;
    readonly code?: string;
    readonly param?: string;
    readonly retry_after?: number;
  };
}

export interface ResponseTransformationError {
  readonly type: 'response_transformation_error';
  readonly message: string;
  readonly code: string;
  readonly originalError?: unknown;
  readonly correlationId: string;
}

export interface TimeoutError {
  readonly type: 'timeout_error';
  readonly message: string;
  readonly timeout: number;
  readonly correlationId: string;
}

// Tool Call Processing Types
export interface ToolCallResult {
  readonly tool_call_id: string;
  readonly content: string;
  readonly is_error: boolean;
}

// Conversation Management Types
export interface ConversationContext {
  readonly conversationId: string;
  readonly messageCount: number;
  readonly previousResponseId?: string;
  readonly taskComplexity: 'simple' | 'medium' | 'complex';
  readonly totalTokensUsed: number;
  readonly averageResponseTime: number;
}

export interface ConversationMetrics {
  readonly messageCount: number;
  readonly totalTokensUsed: number;
  readonly reasoningTokensUsed: number;
  readonly averageResponseTime: number;
  readonly errorCount: number;
}

// Configuration Types
export interface ProxyConfiguration {
  readonly azure: AzureOpenAIConfig;
  readonly reasoning: ReasoningConfig;
  readonly conversation: ConversationConfig;
  readonly monitoring: MonitoringConfig;
  readonly security: SecurityConfig;
}

export interface ReasoningConfig {
  readonly defaultEffort: ReasoningEffort;
  readonly enableIntelligentRouting: boolean;
  readonly enableDynamicAdjustment: boolean;
  readonly skipReasoningByDefault: boolean; // Default to no reasoning unless complexity detected
  readonly complexityThresholds: {
    readonly simpleCompletionMaxLength: number; // Skip reasoning below this length
    readonly mediumComplexityMinLength: number; // Consider 'medium' reasoning above this
    readonly highComplexityMinLength: number; // Consider 'high' reasoning above this
    readonly maxCodeBlocksForSimple: number; // Skip reasoning if fewer code blocks
    readonly minConversationDepthForReasoning: number; // Conversation turns before considering reasoning
  };
  readonly decisionWeights: {
    readonly contentLengthWeight: number;
    readonly codeBlockWeight: number;
    readonly architecturalKeywordWeight: number;
    readonly algorithmicKeywordWeight: number;
    readonly frameworkComplexityWeight: number;
    readonly conversationDepthWeight: number;
    readonly multiLanguageWeight: number;
  };
  readonly languageOptimizations: {
    readonly enableLanguageDetection: boolean;
    readonly python: LanguageOptimizationConfig;
    readonly java: LanguageOptimizationConfig;
    readonly kotlin: LanguageOptimizationConfig;
    readonly typescript: LanguageOptimizationConfig;
    readonly javascript: LanguageOptimizationConfig;
    readonly shell: LanguageOptimizationConfig;
    readonly swift: LanguageOptimizationConfig;
  };
  readonly frameworkOptimizations: {
    readonly django: FrameworkOptimizationConfig;
    readonly fastapi: FrameworkOptimizationConfig;
    readonly springBoot: FrameworkOptimizationConfig;
    readonly springCloud: FrameworkOptimizationConfig;
    readonly react: FrameworkOptimizationConfig;
    readonly vue: FrameworkOptimizationConfig;
    readonly androidSdk: FrameworkOptimizationConfig;
  };
}

// Language and Framework Detection Types
export type ProgrammingLanguage =
  | 'python'
  | 'java'
  | 'kotlin'
  | 'typescript'
  | 'javascript'
  | 'shell'
  | 'bash'
  | 'swift'
  | 'go'
  | 'rust'
  | 'unknown';

export type Framework =
  | 'django'
  | 'fastapi'
  | 'flask'
  | 'spring-boot'
  | 'spring-cloud'
  | 'react'
  | 'vue'
  | 'angular'
  | 'android-sdk'
  | 'express'
  | 'nestjs'
  | 'next'
  | 'nuxt'
  | 'unknown';

export type TaskComplexity = 'simple' | 'medium' | 'complex' | 'architectural';
export type DevelopmentType =
  | 'completion'
  | 'debugging'
  | 'architecture'
  | 'testing'
  | 'devops';

export interface LanguageOptimizationConfig {
  readonly enabled: boolean;
  readonly keywords: readonly string[];
  readonly complexityKeywords: readonly string[];
  readonly shouldTriggerReasoning: boolean; // Whether this language should trigger reasoning
  readonly complexityThreshold: number; // Content length threshold for complexity
}

export interface FrameworkOptimizationConfig {
  readonly enabled: boolean;
  readonly keywords: readonly string[];
  readonly architecturalKeywords: readonly string[];
  readonly shouldTriggerReasoning: boolean;
  readonly complexityThreshold: number;
  readonly minContentLength: number; // Minimum content length to consider framework complexity
}

// Reasoning Analysis Types
export interface ComplexityFactors {
  readonly contentLength: number;
  readonly messageCount: number;
  readonly codeBlockCount: number;
  readonly languageContext: LanguageContext;
  readonly hasArchitecturalKeywords: boolean;
  readonly hasAlgorithmicKeywords: boolean;
  readonly hasDebuggingKeywords: boolean;
  readonly isSimpleCompletion: boolean;
  readonly conversationDepth: number;
  readonly hasMultipleLanguages: boolean;
  readonly hasComplexFrameworkPatterns: boolean;
}

export interface LanguageContext {
  readonly primaryLanguage: ProgrammingLanguage;
  readonly frameworks: readonly Framework[];
  readonly complexity: TaskComplexity;
  readonly developmentType: DevelopmentType;
}

export interface TaskComplexityIndicators {
  readonly algorithmKeywords: readonly string[];
  readonly architectureKeywords: readonly string[];
  readonly debuggingKeywords: readonly string[];
  readonly simpleTaskKeywords: readonly string[];
  readonly languageSpecific: Record<ProgrammingLanguage, LanguageIndicators>;
}

export interface LanguageIndicators {
  readonly complexityKeywords: readonly string[];
  readonly frameworkKeywords: readonly string[];
  readonly simplePatterns: readonly string[];
  readonly architecturalPatterns: readonly string[];
}

export interface ConversationConfig {
  readonly maxConversationAge: number; // milliseconds
  readonly cleanupInterval: number; // milliseconds
  readonly maxStoredConversations: number;
}

export interface MonitoringConfig {
  readonly enableMetrics: boolean;
  readonly metricsPort: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly enablePerformanceTracking: boolean;
  readonly enableSecurityAuditing: boolean;
  readonly correlationIdHeader: string;
  readonly enableReasoningMetrics: boolean;
  readonly enableDynamicConfig: boolean;
}

export interface SecurityConfig {
  readonly enableInputValidation: boolean;
  readonly maxRequestSize: number;
  readonly rateLimitConfig: {
    readonly windowMs: number;
    readonly maxRequests: number;
    readonly clientSpecificLimits: Record<ClientType, number>;
  };
  readonly authenticationConfig: {
    readonly enableBearerToken: boolean;
    readonly enableApiKey: boolean;
    readonly tokenValidationEndpoint?: string;
  };
}

// Performance Metrics Types
export interface PerformanceMetrics {
  readonly requestCount: number;
  readonly averageResponseTime: number;
  readonly reasoningTokensUsed: number;
  readonly totalTokensUsed: number;
  readonly errorRate: number;
  readonly concurrentRequests: number;
}

export interface SecurityAuditLog {
  readonly timestamp: string;
  readonly correlationId: string;
  readonly eventType:
    | 'authentication'
    | 'authorization'
    | 'validation'
    | 'rate_limit'
    | 'suspicious_activity';
  readonly clientInfo: {
    readonly userAgent?: string;
    readonly ipAddress?: string;
    readonly clientType: ClientType;
  };
  readonly details: Record<string, unknown>;
}

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

// Type guards for runtime validation

/**
 * Type guard to check if a value is a plain object (not null, not array)
 *
 * @param value - The value to check
 * @returns True if value is a plain object
 *
 * @example
 * ```typescript
 * isRecord({}) // true
 * isRecord([]) // false
 * isRecord(null) // false
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a string
 *
 * @param value - The value to check
 * @returns True if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a valid number (not NaN)
 *
 * @param value - The value to check
 * @returns True if value is a valid number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 *
 * @param value - The value to check
 * @returns True if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is an array
 *
 * @param value - The value to check
 * @returns True if value is an array
 */
export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard to check if a value is a valid reasoning effort level
 *
 * @param value - The value to check
 * @returns True if value is a valid ReasoningEffort
 */
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    isString(value) && ['minimal', 'low', 'medium', 'high'].includes(value)
  );
}

export function isClientType(value: unknown): value is ClientType {
  return (
    isString(value) &&
    [
      'claude-code-cli',
      'xcode-coding-assistant',
      'openai-compatible',
      'unknown',
    ].includes(value)
  );
}

export function isRequestFormat(value: unknown): value is RequestFormat {
  return isString(value) && ['claude', 'openai'].includes(value);
}

export function isResponseFormat(value: unknown): value is ResponseFormat {
  return isString(value) && ['claude', 'openai'].includes(value);
}

export function isResponseMessage(value: unknown): value is ResponseMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { role, content } = value;
  return (
    isString(role) &&
    ['user', 'assistant', 'system'].includes(role) &&
    isString(content)
  );
}

export function isResponsesCreateParams(
  value: unknown
): value is ResponsesCreateParams {
  if (!isRecord(value)) {
    return false;
  }

  const { model, input } = value;
  if (!isString(model)) {
    return false;
  }

  if (isString(input)) {
    return true;
  }
  if (isArray(input)) {
    return input.every(isResponseMessage);
  }

  return false;
}

export function isOpenAIMessage(value: unknown): value is OpenAIMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { role, content } = value;
  return (
    isString(role) &&
    ['user', 'assistant', 'system', 'tool'].includes(role) &&
    (isString(content) || content === null)
  );
}

export function isOpenAIRequest(value: unknown): value is OpenAIRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { model, messages } = value;
  return (
    isString(model) && isArray(messages) && messages.every(isOpenAIMessage)
  );
}

export function isClaudeMessage(value: unknown): value is ClaudeMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { role, content } = value;
  return (
    isString(role) &&
    ['user', 'assistant', 'system'].includes(role) &&
    (isString(content) || isArray(content))
  );
}

export function isClaudeRequest(value: unknown): value is ClaudeRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { model, messages } = value;
  return (
    isString(model) && isArray(messages) && messages.every(isClaudeMessage)
  );
}

export function isOpenAIResponse(value: unknown): value is OpenAIResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { id, object, created, model, choices } = value;
  return (
    isString(id) &&
    isString(object) &&
    (object === 'chat.completion' || object === 'chat.completion.chunk') &&
    isNumber(created) &&
    isString(model) &&
    isArray(choices)
  );
}

export function isClaudeResponse(value: unknown): value is ClaudeResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { id, type, role, content, model } = value;
  return (
    isString(id) &&
    type === 'message' &&
    role === 'assistant' &&
    isArray(content) &&
    isString(model)
  );
}

export function isResponsesResponse(
  value: unknown
): value is ResponsesResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { id, object, created, model, output, usage } = value;
  return (
    isString(id) &&
    object === 'response' &&
    isNumber(created) &&
    isString(model) &&
    isArray(output) &&
    isRecord(usage)
  );
}

export function isResponsesStreamChunk(
  value: unknown
): value is ResponsesStreamChunk {
  if (!isRecord(value)) {
    return false;
  }

  const { id, object, created, model, output, usage } = value;
  return (
    isString(id) &&
    object === 'response.chunk' &&
    isNumber(created) &&
    isString(model) &&
    isArray(output) &&
    (usage === undefined || isRecord(usage))
  );
}

export function isAzureOpenAIErrorResponse(
  value: unknown
): value is AzureOpenAIErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { error } = value;
  return error === undefined || isRecord(error);
}

export function isOpenAIError(value: unknown): value is OpenAIError {
  if (!isRecord(value)) {
    return false;
  }

  const { error } = value;
  return isRecord(error) && isString(error.message) && isString(error.type);
}

export function isClaudeError(value: unknown): value is ClaudeError {
  if (!isRecord(value)) {
    return false;
  }

  const { type, error } = value;
  return (
    type === 'error' &&
    isRecord(error) &&
    isString(error.type) &&
    isString(error.message)
  );
}

export function isHealthCheckResult(
  value: unknown
): value is HealthCheckResult {
  if (!isRecord(value)) {
    return false;
  }

  const { status, timestamp, uptime, memory } = value;
  return (
    isString(status) &&
    ['healthy', 'unhealthy'].includes(status) &&
    isString(timestamp) &&
    isNumber(uptime) &&
    isRecord(memory)
  );
}

export function isIncomingRequest(value: unknown): value is IncomingRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { headers, body, path } = value;
  return isRecord(headers) && body !== undefined && isString(path);
}

export function isAuthenticationResult(
  value: unknown
): value is AuthenticationResult {
  return (
    isString(value) &&
    Object.values(AuthenticationResult).includes(value as AuthenticationResult)
  );
}

export function isAuthenticationMethod(
  value: unknown
): value is AuthenticationMethod {
  return (
    isString(value) &&
    Object.values(AuthenticationMethod).includes(value as AuthenticationMethod)
  );
}
