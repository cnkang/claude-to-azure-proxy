// Shared type definitions for the monorepo

export * from './logging';

// Common API types
export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

export interface ApiError {
  readonly message: string;
  readonly code: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown>;
}

// Configuration types
export interface BaseConfig {
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly PORT: number;
  readonly LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
}

// Request/Response types
export interface RequestContext {
  readonly correlationId: string;
  readonly timestamp: Date;
  readonly userAgent?: string | undefined;
  readonly ip?: string | undefined;
}

// Model types
export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly contextLength: number;
  readonly isAvailable: boolean;
  readonly provider: 'azure-openai' | 'aws-bedrock';
  readonly category: 'general' | 'coding' | 'reasoning';
}

// Session types
export interface SessionInfo {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly fingerprint?: string;
}

// Conversation types
export interface ConversationMetadata {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
  readonly sessionId: string;
}

// Message types
export interface MessageBase {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly conversationId: string;
}

// File types
export interface FileInfo {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly url?: string;
}

// Streaming types
export interface StreamChunk {
  readonly type: 'start' | 'chunk' | 'end' | 'error' | 'heartbeat';
  readonly content?: string;
  readonly messageId?: string;
  readonly correlationId: string;
  readonly timestamp: number;
}

// Feature flags
export interface FeatureFlags {
  readonly fileUpload: boolean;
  readonly imageUpload: boolean;
  readonly codeHighlighting: boolean;
  readonly streamingResponses: boolean;
}

// Frontend-specific types
export interface ThemeConfig {
  readonly mode: 'light' | 'dark' | 'auto';
  readonly colors: {
    readonly primary: string;
    readonly secondary: string;
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly textSecondary: string;
    readonly border: string;
    readonly error: string;
    readonly warning: string;
    readonly success: string;
    readonly info: string;
  };
}

export interface I18nConfig {
  readonly language: 'en' | 'zh';
  readonly fallbackLanguage: 'en';
  readonly supportedLanguages: readonly string[];
}

export interface UserPreferences {
  readonly theme: ThemeConfig['mode'];
  readonly language: I18nConfig['language'];
  readonly sidebarOpen: boolean;
  readonly autoSave: boolean;
  readonly notifications: boolean;
}

// Context management types
export interface ContextUsage {
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly warningThreshold: number;
  readonly canExtend: boolean;
  readonly extendedMaxTokens?: number;
  readonly isExtended: boolean;
}

export interface CompressionEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly compressionRatio: number;
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
}

export interface ModelChange {
  readonly messageId: string;
  readonly fromModel?: string;
  readonly toModel: string;
  readonly timestamp: string;
}

// Enhanced conversation types
export interface ConversationBase extends ConversationMetadata {
  readonly modelHistory: readonly ModelChange[];
  readonly contextUsage: ContextUsage;
  readonly parentConversationId?: string;
  readonly compressionHistory?: readonly CompressionEvent[];
}

// Enhanced message types
export interface Message extends MessageBase {
  readonly files?: readonly FileInfo[];
  readonly codeBlocks?: readonly CodeBlock[];
  readonly model?: string;
  readonly isComplete: boolean;
  readonly contextTokens?: number;
}

export interface CodeBlock {
  readonly id: string;
  readonly language: string;
  readonly code: string;
  readonly startLine?: number;
  readonly filename?: string;
}

// Client configuration types
export interface ClientConfig {
  readonly maxFileSize: number;
  readonly supportedFileTypes: readonly string[];
  readonly availableModels: readonly ModelInfo[];
  readonly features: FeatureFlags;
  readonly maxConversations: number;
  readonly maxMessagesPerConversation: number;
  readonly defaultModel: string;
  readonly modelCategories: {
    readonly general: readonly string[];
    readonly coding: readonly string[];
    readonly reasoning: readonly string[];
  };
}

// Storage types
export interface StorageQuota {
  readonly used: number;
  readonly quota: number;
  readonly percentage: number;
}

// Utility types
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];

export type OptionalKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? K : never;
}[keyof T];

// Event types
export type EventHandler<T = void> = (data: T) => void | Promise<void>;

export interface EventMap {
  readonly [key: string]: unknown;
}

// Validation types
export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

// HTTP types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpRequestOptions {
  readonly method: HttpMethod;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeout?: number;
  readonly retries?: number;
}
