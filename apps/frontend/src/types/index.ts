// Core application types
export interface AppState {
  session: SessionState;
  conversations: ConversationState;
  ui: UIState;
  config: ConfigState;
}

export interface SessionState {
  sessionId: string;
  preferences: UserPreferences;
  createdAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'en' | 'zh';
  selectedModel: string;
}

export interface ConversationFilters {
  readonly searchQuery: string;
  readonly model?: string;
  readonly dateRange?: {
    readonly start: Date;
    readonly end: Date;
  };
  readonly sortBy: 'updatedAt' | 'createdAt' | 'title';
  readonly sortOrder: 'asc' | 'desc';
}

export interface ConversationState {
  conversations: Map<string, Conversation>;
  activeConversationId: string | null;
  isLoading: boolean;
  error?: string;
  filters: ConversationFilters;
  
  // Search state (Requirement 8.1)
  searchQuery: string;
  searchResults: Conversation[];
  isSearching: boolean;
  searchError?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  selectedModel: string;
  createdAt: Date;
  updatedAt: Date;
  sessionId: string;
  isStreaming: boolean;
  streamingMessage?: Partial<Message>;
  modelHistory: ModelChange[];
  contextUsage?: ContextUsage;
  parentConversationId?: string;
  compressionHistory?: CompressionEvent[];
  
  // Persistence tracking fields (Requirements: 1.1, 2.1)
  lastSyncedAt?: Date;
  syncVersion?: number;
  isDirty?: boolean; // Has unsaved changes
  persistenceStatus?: 'synced' | 'pending' | 'error';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  files?: FileInfo[];
  codeBlocks?: CodeBlock[];
  correlationId: string;
  conversationId: string;
  model?: string;
  isComplete: boolean;
  retryable?: boolean;
  contextTokens?: number;
}

export interface FileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  content?: string;
}

export interface CodeBlock {
  id: string;
  language: string;
  code: string;
  startLine?: number;
  filename?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  contextLength: number;
  isAvailable: boolean;
  provider: 'azure-openai' | 'aws-bedrock';
  category: 'general' | 'coding' | 'reasoning';
  pricing?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ContextUsage {
  currentTokens: number;
  maxTokens: number;
  warningThreshold: number;
  canExtend: boolean;
  extendedMaxTokens?: number;
  isExtended: boolean;
}

export interface CompressionEvent {
  id: string;
  timestamp: Date;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  method: 'ai-summary' | 'selective-removal' | 'hierarchical';
}

export interface ModelChange {
  messageId: string;
  fromModel?: string;
  toModel: string;
  timestamp: Date;
}

export interface UIState {
  theme: 'light' | 'dark' | 'auto';
  language: 'en' | 'zh';
  sidebarOpen: boolean;
  isLoading: boolean;
  error?: string;
}

export interface ConfigState {
  availableModels: ModelInfo[];
  maxFileSize: number;
  supportedFileTypes: string[];
  features: FeatureFlags;
}

export interface FeatureFlags {
  fileUpload: boolean;
  imageUpload: boolean;
  codeHighlighting: boolean;
  streamingResponses: boolean;
}

// API types
export interface ClientConfig {
  maxFileSize: number;
  supportedFileTypes: string[];
  availableModels: ModelInfo[];
  features: FeatureFlags;
  maxConversations: number;
  maxMessagesPerConversation: number;
  defaultModel: string;
  modelCategories: {
    general: string[];
    coding: string[];
    reasoning: string[];
  };
}

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
}

// Stream types
export interface StreamChunk {
  type: 'start' | 'chunk' | 'end' | 'error' | 'heartbeat';
  content?: string;
  messageId?: string;
  correlationId: string;
  timestamp: number;
}

// Request/Response types
export interface ChatRequest {
  message: string;
  model: string;
  conversationId: string;
  files?: FileInfo[];
  correlationId: string;
  // Task 10 Fix: Backend validation expects only role and content
  contextMessages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export interface ConversationRequest {
  title?: string;
  initialModel?: string;
}

export interface ConversationUpdateRequest {
  title?: string;
  model?: string;
}

export interface ConversationResponse {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: {
    content: string;
    timestamp: string;
    role: 'user' | 'assistant';
  };
}
