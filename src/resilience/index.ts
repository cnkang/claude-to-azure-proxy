/**
 * Resilience module exports
 * Provides comprehensive error handling, circuit breaking, retry logic, and graceful degradation
 */

// Circuit breaker exports
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerState,
  circuitBreakerRegistry,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult
} from './circuit-breaker.js';

// Retry logic exports
export {
  RetryStrategy,
  RetryStrategyRegistry,
  retryStrategyRegistry,
  withRetry,
  type RetryConfig,
  type RetryAttempt,
  type RetryResult,
  type RetryMetrics
} from './retry.js';

// Graceful degradation exports
export {
  GracefulDegradationManager,
  gracefulDegradationManager,
  checkFeatureAvailability,
  type DegradationStrategy,
  type DegradationContext,
  type DegradationResult,
  type ServiceLevel
} from './graceful-degradation.js';