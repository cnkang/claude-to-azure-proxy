/**
 * Enhanced Azure OpenAI Responses API client with comprehensive error handling,
 * retry logic, circuit breaker, and fallback mechanisms
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import { circuitBreakerRegistry } from '../resilience/circuit-breaker.js';
import { AzureRetryStrategy, type AzureRetryContext } from '../utils/azure-retry-strategy.js';
import { FallbackHandler, type FallbackContext } from '../utils/fallback-handler.js';
import { AzureErrorMapper, type ErrorMappingContext } from '../utils/azure-error-mapper.js';
import { logger } from '../middleware/logging.js';
import config, { createAzureOpenAIConfig } from '../config/index.js';
import { ErrorFactory } from '../errors/index.js';
import type {
  AzureOpenAIConfig,
  ResponsesCreateParams,
  ResponsesResponse,
  ResponseFormat,
  UniversalRequest,
  UniversalResponse,
  ClaudeError,
  OpenAIError,
} from '../types/index.js';

export interface EnhancedClientConfig extends AzureOpenAIConfig {
  readonly enableCircuitBreaker: boolean;
  readonly enableRetry: boolean;
  readonly enableFallback: boolean;
  readonly circuitBreakerName: string;
}

export interface ClientResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: ClaudeError | OpenAIError;
  readonly metadata: {
    readonly attempts: number;
    readonly totalDurationMs: number;
    readonly circuitBreakerUsed: boolean;
    readonly retryUsed: boolean;
    readonly fallbackUsed: boolean;
    readonly fallbackType?: string;
  };
}

/**
 * Enhanced Azure OpenAI Responses API client
 */
export class EnhancedAzureResponsesClient {
  private readonly axiosClient: AxiosInstance;
  private readonly clientConfig: EnhancedClientConfig;
  private readonly retryStrategy: AzureRetryStrategy;
  private readonly circuitBreakerName: string;

  constructor(overrideConfig?: Partial<EnhancedClientConfig>) {
    const baseAzureConfig = createAzureOpenAIConfig(config);

    const mergedConfig: EnhancedClientConfig = Object.freeze({
      ...baseAzureConfig,
      enableCircuitBreaker: true,
      enableRetry: true,
      enableFallback: true,
      circuitBreakerName: 'azure-responses-api',
      ...(overrideConfig ?? {}),
    });

    this.clientConfig = mergedConfig;
    this.circuitBreakerName = mergedConfig.circuitBreakerName;
    this.retryStrategy = new AzureRetryStrategy('azure-responses-client', {
      maxAttempts: mergedConfig.maxRetries,
    });

    const defaultHeaders: Record<string, string> = {
      Authorization: `Bearer ${mergedConfig.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-to-azure-proxy/1.0.0',
    };

    if (
      typeof mergedConfig.apiVersion === 'string' &&
      mergedConfig.apiVersion.trim().length > 0
    ) {
      defaultHeaders['api-version'] = mergedConfig.apiVersion;
    }

    // Create axios instance with proper configuration
    this.axiosClient = axios.create({
      baseURL: mergedConfig.baseURL,
      timeout: mergedConfig.timeout,
      headers: defaultHeaders,
    });

    // Add request interceptor for logging
    this.axiosClient.interceptors.request.use(
      (requestConfig) => {
        const hasData = requestConfig.data !== undefined;
        logger.debug('Azure OpenAI request initiated', 'azure-responses-client', {
          url: requestConfig.url,
          method: requestConfig.method,
          hasData,
        });
        return requestConfig;
      },
      (error: unknown) => {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error('Azure OpenAI request setup failed');

        logger.error(
          'Azure OpenAI request setup failed',
          'azure-responses-client',
          {},
          normalizedError
        );

        return Promise.reject(normalizedError);
      }
    );

    // Add response interceptor for logging
    this.axiosClient.interceptors.response.use(
      (response) => {
        const hasData = response.data !== undefined && response.data !== null;
        logger.debug('Azure OpenAI response received', 'azure-responses-client', {
          status: response.status,
          hasData,
        });
        return response;
      },
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          logger.warn('Azure OpenAI response error', 'azure-responses-client', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
          });
          return Promise.reject(error);
        }

        const normalizedError =
          error instanceof Error
            ? error
            : new Error('Unknown Azure OpenAI response error');

        logger.warn(
          'Azure OpenAI response error',
          'azure-responses-client',
          { message: normalizedError.message }
        );

        return Promise.reject(normalizedError);
      }
    );
  }

  /**
   * Create completion with comprehensive error handling
   */
  public async createCompletion(
    params: ResponsesCreateParams,
    correlationId: string,
    requestFormat: ResponseFormat,
    originalRequest: UniversalRequest
  ): Promise<ClientResponse<ResponsesResponse>> {
    const startTime = Date.now();
    const operation = 'create_completion';

    logger.info('Creating Azure OpenAI completion', correlationId, {
      model: params.model,
      hasReasoning: !!params.reasoning,
      stream: params.stream,
      maxOutputTokens: params.max_output_tokens,
    });

    // Circuit breaker protection
    if (this.clientConfig.enableCircuitBreaker) {
      const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(
        this.circuitBreakerName
      );

      const circuitResult = await circuitBreaker.execute(
        () => this.executeCompletionRequest(params, correlationId),
        correlationId,
        operation
      );

      if (!circuitResult.success) {
        // Circuit breaker is open or half-open failed
        if (this.clientConfig.enableFallback) {
          return this.executeFallback(
            {
              correlationId,
              operation,
              requestFormat,
              originalRequest,
              error: circuitResult.error!,
              attempt: 1,
            },
            startTime
          );
        }

        // Map circuit breaker error
        const mappingContext: ErrorMappingContext = {
          correlationId,
          operation,
          requestFormat,
          originalError: circuitResult.error!,
        };

        const mappedError = AzureErrorMapper.mapError(mappingContext);
        
        return {
          success: false,
          error: mappedError.clientResponse,
          metadata: {
            attempts: 1,
            totalDurationMs: Date.now() - startTime,
            circuitBreakerUsed: true,
            retryUsed: false,
            fallbackUsed: false,
          },
        };
      }

      return {
        success: true,
        data: circuitResult.data!,
        metadata: {
          attempts: 1,
          totalDurationMs: Date.now() - startTime,
          circuitBreakerUsed: true,
          retryUsed: false,
          fallbackUsed: false,
        },
      };
    }

    // Direct execution with retry
    if (this.clientConfig.enableRetry) {
      const retryContext: AzureRetryContext = {
        correlationId,
        operation,
        requestFormat,
        originalParams: params,
      };

      const retryResult = await this.retryStrategy.executeWithRetry(
        () => this.executeCompletionRequest(params, correlationId),
        retryContext
      );

      if (retryResult.success) {
        return {
          success: true,
          data: retryResult.data!,
          metadata: {
            attempts: retryResult.attempts,
            totalDurationMs: retryResult.totalDurationMs,
            circuitBreakerUsed: false,
            retryUsed: retryResult.attempts > 1,
            fallbackUsed: false,
          },
        };
      }

      // Retry failed, try fallback
      if (this.clientConfig.enableFallback) {
        return this.executeFallback(
          {
            correlationId,
            operation,
            requestFormat,
            originalRequest,
            error: retryResult.error!,
            attempt: retryResult.attempts,
          },
          startTime
        );
      }

      // Map retry failure error
      const mappingContext: ErrorMappingContext = {
        correlationId,
        operation,
        requestFormat,
        originalError: retryResult.error!,
      };

      const mappedError = AzureErrorMapper.mapError(mappingContext);
      
      return {
        success: false,
        error: mappedError.clientResponse,
        metadata: {
          attempts: retryResult.attempts,
          totalDurationMs: retryResult.totalDurationMs,
          circuitBreakerUsed: false,
          retryUsed: true,
          fallbackUsed: false,
        },
      };
    }

    // Direct execution without retry
    try {
      const response = await this.executeCompletionRequest(params, correlationId);
      
      return {
        success: true,
        data: response,
        metadata: {
          attempts: 1,
          totalDurationMs: Date.now() - startTime,
          circuitBreakerUsed: false,
          retryUsed: false,
          fallbackUsed: false,
        },
      };
    } catch (error) {
      // Direct execution failed, try fallback
      if (this.clientConfig.enableFallback) {
        return this.executeFallback(
          {
            correlationId,
            operation,
            requestFormat,
            originalRequest,
            error: error as Error,
            attempt: 1,
          },
          startTime
        );
      }

      // Map direct execution error
      const mappingContext: ErrorMappingContext = {
        correlationId,
        operation,
        requestFormat,
        originalError: error,
      };

      const mappedError = AzureErrorMapper.mapError(mappingContext);
      
      return {
        success: false,
        error: mappedError.clientResponse,
        metadata: {
          attempts: 1,
          totalDurationMs: Date.now() - startTime,
          circuitBreakerUsed: false,
          retryUsed: false,
          fallbackUsed: false,
        },
      };
    }
  }

  /**
   * Execute the actual completion request
   */
  private async executeCompletionRequest(
    params: ResponsesCreateParams,
    correlationId: string
  ): Promise<ResponsesResponse> {
    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url: `/deployments/${this.clientConfig.deployment}/responses`,
      data: params,
      headers: {
        'X-Correlation-ID': correlationId,
      },
    };

    try {
      const response: AxiosResponse<ResponsesResponse> = await this.axiosClient.request(
        requestConfig
      );

      logger.info('Azure OpenAI completion successful', correlationId, {
        responseId: response.data.id,
        model: response.data.model,
        outputCount: response.data.output.length,
        totalTokens: response.data.usage.total_tokens,
        reasoningTokens: response.data.usage.reasoning_tokens,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError<ResponsesResponse>(error)) {
        const mappedError = ErrorFactory.fromAzureOpenAIError(
          error.response?.data ?? error,
          correlationId,
          'executeCompletionRequest'
        );

        logger.error(
          'Azure OpenAI API error',
          correlationId,
          {
            status: error.response?.status,
            statusText: error.response?.statusText,
            errorType: mappedError.azureErrorType,
            errorMessage: mappedError.message,
          },
          mappedError
        );

        throw mappedError;
      }

      const normalizedError =
        error instanceof Error
          ? error
          : new Error('Unexpected error in Azure OpenAI request');

      logger.error(
        'Unexpected error in Azure OpenAI request',
        correlationId,
        { error: normalizedError.message },
        normalizedError
      );

      throw normalizedError;
    }
  }

  /**
   * Execute fallback strategy
   */
  private async executeFallback(
    context: FallbackContext,
    startTime: number
  ): Promise<ClientResponse<ResponsesResponse>> {
    logger.warn('Executing fallback for Azure OpenAI request', context.correlationId, {
      operation: context.operation,
      attempt: context.attempt,
    });

    try {
      const fallbackResult = await FallbackHandler.executeFallback(context);

      if (fallbackResult.success && fallbackResult.response) {
        // Convert fallback response to ResponsesResponse format if needed
        const responsesResponse = this.convertToResponsesFormat(
          fallbackResult.response,
          context
        );

        return {
          success: true,
          data: responsesResponse,
          metadata: {
            attempts: context.attempt,
            totalDurationMs: Date.now() - startTime,
            circuitBreakerUsed: this.clientConfig.enableCircuitBreaker,
            retryUsed: this.clientConfig.enableRetry,
            fallbackUsed: true,
            fallbackType: fallbackResult.fallbackUsed,
          },
        };
      }

      return {
        success: false,
        error: fallbackResult.error!,
        metadata: {
          attempts: context.attempt,
          totalDurationMs: Date.now() - startTime,
          circuitBreakerUsed: this.clientConfig.enableCircuitBreaker,
          retryUsed: this.clientConfig.enableRetry,
          fallbackUsed: true,
          fallbackType: fallbackResult.fallbackUsed,
        },
      };
    } catch (fallbackError) {
      logger.error('Fallback execution failed', context.correlationId, {
        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
      });

      const fallbackErrorResponse = FallbackHandler.createFallbackError(context);

      return {
        success: false,
        error: fallbackErrorResponse,
        metadata: {
          attempts: context.attempt,
          totalDurationMs: Date.now() - startTime,
          circuitBreakerUsed: this.clientConfig.enableCircuitBreaker,
          retryUsed: this.clientConfig.enableRetry,
          fallbackUsed: true,
          fallbackType: 'error_fallback',
        },
      };
    }
  }

  /**
   * Convert fallback response to ResponsesResponse format
   */
  private convertToResponsesFormat(
    response: UniversalResponse,
    context: FallbackContext
  ): ResponsesResponse {
    // This is a simplified conversion - in a real implementation,
    // you would need more sophisticated conversion logic
    return {
      id: `fallback_${Date.now()}`,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model: context.originalRequest.model || 'gpt-4',
      output: [
        {
          type: 'text',
          text: 'Fallback response - service temporarily unavailable',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      },
    };
  }

  /**
   * Health check with error handling
   */
  public async healthCheck(correlationId: string): Promise<{
    healthy: boolean;
    responseTime?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Simple health check request
      const response = await this.axiosClient.get('/models', {
        timeout: 10000, // 10 second timeout for health checks
        headers: {
          'X-Correlation-ID': correlationId,
        },
      });

      const responseTime = Date.now() - startTime;

      logger.info('Azure OpenAI health check successful', correlationId, {
        responseTime,
        status: response.status,
      });

      return {
        healthy: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.warn('Azure OpenAI health check failed', correlationId, {
        responseTime,
        error: errorMessage,
      });

      return {
        healthy: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Get client metrics
   */
  public getMetrics() {
    const retryMetrics = this.retryStrategy.getMetrics();
    const circuitBreakerMetrics = this.clientConfig.enableCircuitBreaker
      ? circuitBreakerRegistry.getCircuitBreaker(this.circuitBreakerName).getMetrics()
      : null;

    return {
      retry: retryMetrics,
      circuitBreaker: circuitBreakerMetrics,
      config: {
        enableCircuitBreaker: this.clientConfig.enableCircuitBreaker,
        enableRetry: this.clientConfig.enableRetry,
        enableFallback: this.clientConfig.enableFallback,
        timeout: this.clientConfig.timeout,
        maxRetries: this.clientConfig.maxRetries,
      },
    };
  }

  /**
   * Reset client metrics
   */
  public resetMetrics(): void {
    this.retryStrategy.resetMetrics();
    
    if (this.clientConfig.enableCircuitBreaker) {
      circuitBreakerRegistry.getCircuitBreaker(this.circuitBreakerName).reset();
    }
  }
}

// Export singleton instance
export const enhancedAzureResponsesClient = new EnhancedAzureResponsesClient();
