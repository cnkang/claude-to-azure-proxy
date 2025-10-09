/**
 * Circuit breaker pattern implementation with exponential backoff
 * Provides resilience against cascading failures and service degradation
 */

import { CircuitBreakerError } from '../errors/index.js';

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly recoveryTimeout: number;
  readonly monitoringPeriod: number;
  readonly expectedErrors: readonly string[];
  readonly maxBackoffMs: number;
  readonly backoffMultiplier: number;
}

export interface CircuitBreakerMetrics {
  readonly state: CircuitBreakerState;
  readonly failureCount: number;
  readonly successCount: number;
  readonly totalRequests: number;
  readonly lastFailureTime?: Date;
  readonly nextAttemptTime?: Date;
  readonly currentBackoffMs: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
  readonly metrics: CircuitBreakerMetrics;
}

/**
 * Circuit breaker implementation with exponential backoff and jitter
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;
  private currentBackoffMs: number;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'AZURE_OPENAI_ERROR'],
      maxBackoffMs: 300000, // 5 minutes
      backoffMultiplier: 2,
      ...config,
    };
    this.currentBackoffMs = 1000; // Start with 1 second
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(
    operation: () => Promise<T>,
    correlationId: string,
    operationName?: string
  ): Promise<CircuitBreakerResult<T>> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        const error = new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.name}. Next attempt at ${this.nextAttemptTime?.toISOString()}`,
          correlationId,
          this.state,
          this.nextAttemptTime,
          operationName
        );

        return {
          success: false,
          error,
          metrics: this.getMetrics(),
        };
      }
    }

    try {
      const result = await operation();
      this.onSuccess();

      return {
        success: true,
        data: result,
        metrics: this.getMetrics(),
      };
    } catch (error) {
      this.onFailure(error as Error);

      return {
        success: false,
        error: error as Error,
        metrics: this.getMetrics(),
      };
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.failureCount = 0;
    this.currentBackoffMs = 1000; // Reset backoff

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    // Only count expected errors towards circuit breaker
    const errorName = error.name || '';
    const errorMessage = error.message || '';
    const isExpectedError = this.config.expectedErrors.some(
      (expectedError) =>
        errorName.includes(expectedError) ||
        errorMessage.includes(expectedError)
    );

    if (!isExpectedError) {
      return; // Don't count unexpected errors
    }

    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // If we're in half-open and get a failure, go back to open
      this.openCircuit();
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitBreakerState.OPEN;
    this.calculateNextAttemptTime();
  }

  /**
   * Calculate next attempt time with exponential backoff and jitter
   */
  private calculateNextAttemptTime(): void {
    // Exponential backoff with jitter
    const jitter = Math.random() * 0.1; // 10% jitter
    const backoffWithJitter = this.currentBackoffMs * (1 + jitter);

    this.nextAttemptTime = new Date(Date.now() + backoffWithJitter);

    // Increase backoff for next time, up to maximum
    this.currentBackoffMs = Math.min(
      this.currentBackoffMs * this.config.backoffMultiplier,
      this.config.maxBackoffMs
    );
  }

  /**
   * Check if we should attempt to reset the circuit breaker
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return true;
    }

    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Get current circuit breaker metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      currentBackoffMs: this.currentBackoffMs,
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  public reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    this.currentBackoffMs = 1000;
  }

  /**
   * Get circuit breaker name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Check if circuit breaker is healthy
   */
  public isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Get failure rate over monitoring period
   */
  public getFailureRate(): number {
    if (this.totalRequests === 0) {
      return 0;
    }

    return this.failureCount / this.totalRequests;
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 300000,
      expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'AZURE_OPENAI_ERROR'],
      maxBackoffMs: 300000,
      backoffMultiplier: 2,
      ...defaultConfig,
    };
  }

  /**
   * Get or create a circuit breaker
   */
  public getCircuitBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      this.circuitBreakers.set(name, new CircuitBreaker(name, mergedConfig));
    }

    return this.circuitBreakers.get(name)!;
  }

  /**
   * Get all circuit breaker metrics
   */
  public getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      // Use Object.assign to safely set property
      Object.assign(metrics, { [name]: circuitBreaker.getMetrics() });
    }

    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  /**
   * Get health status of all circuit breakers
   */
  public getHealthStatus(): Record<string, boolean> {
    const health: Record<string, boolean> = {};

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      // Use Object.assign to safely set property
      Object.assign(health, { [name]: circuitBreaker.isHealthy() });
    }

    return health;
  }

  /**
   * Remove a circuit breaker
   */
  public remove(name: string): boolean {
    return this.circuitBreakers.delete(name);
  }

  /**
   * Get circuit breaker names
   */
  public getNames(): string[] {
    return Array.from(this.circuitBreakers.keys());
  }
}

// Global circuit breaker registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
