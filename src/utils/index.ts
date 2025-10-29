// Re-export request transformation utilities
export {
  transformRequest,
  validateClaudeRequest,
  transformClaudeToAzureRequest,
  createAzureHeaders,
  validateRequestSize,
  RequestTransformationError,
  ValidationError,
  SecurityError,
  type ClaudeCompletionRequest,
  type ClaudeChatCompletionRequest,
  type ClaudeChatMessage,
  type ClaudeRequest,
  type AzureOpenAIRequest,
  type AzureOpenAIMessage,
  type AzureOpenAIHeaders,
} from './request-transformer.js';

// Re-export format detection utilities
export {
  FormatDetectionService,
  ClaudeFormatAnalyzer,
  OpenAIFormatAnalyzer,
  createFormatDetectionService,
  detectRequestFormat,
  getResponseFormat,
  type FormatDetector,
} from './format-detection.js';

// Re-export universal request transformation utilities
export {
  ClaudeToResponsesTransformer,
  createClaudeToResponsesTransformer,
  transformClaudeToResponses,
} from './claude-to-responses-transformer.js';

export {
  OpenAIToResponsesTransformer,
  createOpenAIToResponsesTransformer,
  transformOpenAIToResponses,
} from './openai-to-responses-transformer.js';

export {
  UniversalRequestProcessor,
  createUniversalRequestProcessor,
  defaultUniversalProcessorConfig,
  type UniversalProcessingResult,
  type UniversalProcessorConfig,
} from './universal-request-processor.js';

// Re-export reasoning effort analysis utilities
export {
  ReasoningEffortAnalysisService,
  LanguageDetectionService,
  ComplexityAnalysisService,
  ReasoningDecisionEngineService,
  createReasoningEffortAnalyzer,
  analyzeReasoningEffort,
  TASK_COMPLEXITY_INDICATORS,
  type ReasoningEffortAnalyzer,
  type LanguageDetector,
  type ComplexityAnalyzer,
  type ReasoningDecisionEngine,
} from './reasoning-effort-analyzer.js';

// Re-export content-based optimization utilities
export {
  ContentBasedOptimizerService,
  EnhancedReasoningEffortAnalyzer,
  createEnhancedReasoningEffortAnalyzer,
  createContentBasedOptimizer,
  analyzeReasoningEffortWithOptimizations,
  DEVELOPMENT_TASK_PATTERNS,
  LANGUAGE_OPTIMIZATIONS,
  FRAMEWORK_OPTIMIZATIONS,
  type ContentBasedOptimizer,
} from './content-based-optimizer.js';

// Re-export response transformation utilities
export {
  ResponsesToClaudeTransformer,
  createResponsesToClaudeTransformer,
  transformResponsesToClaude,
  transformResponsesStreamToClaude,
  transformResponsesErrorToClaude,
} from './responses-to-claude-transformer.js';

export {
  ResponsesToOpenAITransformer,
  createResponsesToOpenAITransformer,
  transformResponsesToOpenAI,
  transformResponsesStreamToOpenAI,
  transformResponsesErrorToOpenAI,
} from './responses-to-openai-transformer.js';

// Re-export streaming response handling utilities
export {
  ResponsesStreamingHandler,
  createResponsesStreamingHandler,
  ResponsesStreamProcessor,
  createResponsesStreamProcessor,
} from './responses-streaming-handler.js';

// Re-export conversation management utilities
export {
  ConversationManagerImpl,
  createConversationManager,
  conversationManager,
  type ConversationManager,
} from './conversation-manager.js';

// Re-export multi-turn conversation utilities
export {
  MultiTurnConversationHandlerImpl,
  createMultiTurnConversationHandler,
  multiTurnConversationHandler,
  type MultiTurnConversationHandler,
  type MultiTurnConversationConfig,
  type ConversationHistoryEntry,
  type ConversationState,
  type MultiTurnProcessingResult,
} from './multi-turn-conversation.js';

export { resolveCorrelationId } from './correlation-id.js';

export {
  StructuredLogger,
  type SecurityEventContext,
  type StructuredSecurityEvent,
} from './structured-logger.js';

// Re-export memory management utilities
export {
  MemoryManager,
  memoryManager,
  startMemoryMonitoring,
  getCurrentMemoryMetrics,
  detectMemoryLeaks,
  forceGarbageCollection,
  type MemoryMetrics,
  type GCEvent,
  type MemoryLeakDetection,
  type MemorySample,
  type MemoryManagerConfig,
} from './memory-manager.js';

// Re-export resource management utilities
export {
  ResourceManager,
  BaseDisposableResource,
  BaseAsyncDisposableResource,
  HTTPConnectionResource,
  StreamResource,
  TimerResource,
  resourceManager,
  createHTTPConnectionResource,
  createStreamResource,
  createTimerResource,
  createDisposableResource,
  createAsyncDisposableResource,
  withResources,
  createManagedTimeout,
  createManagedInterval,
  createManagedImmediate,
  getResourceStats,
  getAllResourceInfo,
  cleanupDisposedResources,
  disposeAllResources,
  type ResourceType,
  type ResourceInfo,
  type ResourceCleanupFn,
  type DisposableResource,
  type AsyncDisposableResource,
  type ResourceManagerConfig,
} from '../runtime/resource-manager.js';
