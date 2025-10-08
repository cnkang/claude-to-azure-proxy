import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
} from '../src/resilience/circuit-breaker.js';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR'],
    });
  });

  describe('Basic Functionality', () => {
    it('should start in CLOSED state', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
    });

    it('should execute successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should track failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      const result = await circuitBreaker.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // Execute 3 failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation, 'test-correlation-id');
      }

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitBreakerState.OPEN);
      expect(metrics.failureCount).toBe(3);
    });

    it('should reject requests when circuit is open', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation, 'test-correlation-id');
      }

      // Next request should be rejected without calling operation
      const result = await circuitBreaker.execute(
        operation,
        'test-correlation-id'
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Circuit breaker is OPEN');
      expect(operation).toHaveBeenCalledTimes(3); // Only called during failures, not when open
    });
  });

  describe('Recovery Logic', () => {
    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation, 'test-correlation-id');
      }

      expect(circuitBreaker.getMetrics().state).toBe(CircuitBreakerState.OPEN);

      // Wait for recovery timeout (mocked)
      vi.advanceTimersByTime(1100); // Slightly more than recovery timeout

      // Next request should transition to HALF_OPEN
      const successOperation = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(
        successOperation,
        'test-correlation-id'
      );

      expect(result.success).toBe(true);
      expect(circuitBreaker.getMetrics().state).toBe(
        CircuitBreakerState.CLOSED
      );
    });

    it('should reset failure count on successful recovery', async () => {
      const failOperation = vi
        .fn()
        .mockRejectedValue(new Error('NETWORK_ERROR'));
      const successOperation = vi.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(failOperation, 'test-correlation-id');
      }

      // Wait and recover
      vi.advanceTimersByTime(1100);
      await circuitBreaker.execute(successOperation, 'test-correlation-id');

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(1);
    });
  });

  describe('Error Filtering', () => {
    it('should only count expected errors', async () => {
      const networkError = new Error('NETWORK_ERROR');
      const unexpectedError = new Error('UNEXPECTED_ERROR');

      // Network error should count
      await circuitBreaker.execute(
        () => Promise.reject(networkError),
        'test-correlation-id'
      );

      expect(circuitBreaker.getMetrics().failureCount).toBe(1);

      // Unexpected error should not count
      await circuitBreaker.execute(
        () => Promise.reject(unexpectedError),
        'test-correlation-id'
      );

      expect(circuitBreaker.getMetrics().failureCount).toBe(1); // Still 1
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase backoff time with each failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // Open the circuit first time
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation, 'test-correlation-id');
      }

      const initialMetrics = circuitBreaker.getMetrics();
      const initialBackoff = initialMetrics.currentBackoffMs;

      // Wait for recovery timeout and try again to trigger backoff increase
      vi.advanceTimersByTime(1100);

      // This should transition to HALF_OPEN and then back to OPEN, increasing backoff
      await circuitBreaker.execute(operation, 'test-correlation-id');

      const newMetrics = circuitBreaker.getMetrics();
      expect(newMetrics.currentBackoffMs).toBeGreaterThan(initialBackoff);
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy when closed', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should report unhealthy when open', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation, 'test-correlation-id');
      }

      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    it('should calculate failure rate', async () => {
      const successOp = vi.fn().mockResolvedValue('success');
      const failOp = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      // 2 successes, 1 failure
      await circuitBreaker.execute(successOp, 'test-correlation-id');
      await circuitBreaker.execute(successOp, 'test-correlation-id');
      await circuitBreaker.execute(failOp, 'test-correlation-id');

      const failureRate = circuitBreaker.getFailureRate();
      expect(failureRate).toBeCloseTo(1 / 3, 2); // 1 failure out of 3 total
    });
  });
});
