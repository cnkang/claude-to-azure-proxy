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
} from './authentication';

// Security middleware
export {
  helmetConfig,
  globalRateLimit,
  authRateLimit,
  apiRateLimit,
  correlationIdMiddleware,
  timeoutMiddleware,
  corsOptions,
} from './security';

// Logging middleware
export {
  logger,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
} from './logging';

// Format detection middleware
export {
  formatDetectionMiddleware,
  hasFormatDetection,
} from './format-detection';

// Reasoning effort middleware
export {
  reasoningEffortMiddleware,
  hasReasoningAnalysis,
} from './reasoning-effort';

// Memory management middleware
export {
  memoryManagementMiddleware,
  getMemoryMiddlewareStats,
  resetMemoryMiddlewareStats,
  hasMemoryTracking,
  getRequestMemoryInfo,
} from './memory-management';

// Enhanced error handler
export {
  enhancedErrorHandler,
  asyncErrorHandler,
  withErrorBoundary,
} from './error-handler';

// Static assets middleware
export {
  createStaticAssetsMiddleware,
  createSPAFallbackMiddleware,
  createDevelopmentProxyMiddleware,
  checkFrontendBuildExists,
  logFrontendBuildStatus,
} from './static-assets';

// Type exports
export type {
  AuthenticationRequest,
  AuthenticationError,
  AuthenticationResponse,
} from '../types/index';

export type { RequestWithFormat } from './format-detection';
export type { RequestWithReasoningAnalysis } from './reasoning-effort';
export type {
  RequestWithMemoryTracking,
  RequestMemoryInfo,
  MemoryMiddlewareConfig,
} from './memory-management';
