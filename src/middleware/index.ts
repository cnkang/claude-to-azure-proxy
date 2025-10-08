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

// Type exports
export type {
  AuthenticationRequest,
  AuthenticationError,
  AuthenticationResponse,
} from '../types/index.js';
