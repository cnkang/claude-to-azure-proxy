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
