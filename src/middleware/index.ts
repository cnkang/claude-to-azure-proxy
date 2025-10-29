/**
 * Middleware exports for the Claude-to-Azure proxy
 */

// Authentication middleware
export {
  authenticationMiddleware,
  secureAuthenticationMiddleware,
  authenticationRateLimit,
  AuthenticationResult,
  AuthenticationMethod,
} from './authentication.js';

// Security middleware
export {
  helmetConfig,
  globalRateLimit,
  authRateLimit,
  apiRateLimit,
  correlationIdMiddleware,
  timeoutMiddleware,
  corsOptions,
} from './security.js';

// Logging middleware
export {
  logger,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
} from './logging.js';

// Format detection middleware
export {
  formatDetectionMiddleware,
  hasFormatDetection,
} from './format-detection.js';

// Reasoning effort middleware
export {
  reasoningEffortMiddleware,
  hasReasoningAnalysis,
} from './reasoning-effort.js';

// Memory management middleware
export {
  memoryManagementMiddleware,
  getMemoryMiddlewareStats,
  resetMemoryMiddlewareStats,
  hasMemoryTracking,
  getRequestMemoryInfo,
} from './memory-management.js';

// Enhanced error handler
export {
  enhancedErrorHandler,
  asyncErrorHandler,
  withErrorBoundary,
} from './error-handler.js';

// Type exports
export type {
  AuthenticationRequest,
  AuthenticationError,
  AuthenticationResponse,
} from '../types/index.js';

export type { RequestWithFormat } from './format-detection.js';
export type { RequestWithReasoningAnalysis } from './reasoning-effort.js';
export type {
  RequestWithMemoryTracking,
  RequestMemoryInfo,
  MemoryMiddlewareConfig,
} from './memory-management.js';
