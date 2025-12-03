/**
 * Enhanced Azure OpenAI Responses API client with comprehensive error handling,
 * retry logic, circuit breaker, and fallback mechanisms
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import config, { createAzureOpenAIConfig } from '../config/index';
import { ErrorFactory } from '../errors/index';
import { logger } from '../middleware/logging';
import { circuitBreakerRegistry } from '../resilience/circuit-breaker';
import type {
  AzureOpenAIConfig,
  ClaudeError,
  OpenAIError,
  ResponseFormat,
  ResponsesCreateParams,
  ResponsesResponse,
  UniversalRequest,
  UniversalResponse,
} from '../types/index';
import {
  AzureErrorMapper,
  type ErrorMappingContext,
} from '../utils/azure-error-mapper';
import {
  type AzureRetryContext,
  AzureRetryStrategy,
} from '../utils/azure-retry-strategy';
import {
  type FallbackContext,
  FallbackHandler,
} from '../utils/fallback-handler';

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
      timeoutMs: mergedConfig.timeout,
    });

    const defaultHeaders: Record<string, string> = {
      Authorization: `Bearer ${mergedConfig.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-to-azure-proxy/2.0.0',
    };

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
        logger.debug(
          'Azure OpenAI request initiated',
          'azure-responses-client',
          {
            url: requestConfig.url,
            method: requestConfig.method,
            hasData,
          }
        );
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
        logger.debug(
          'Azure OpenAI response received',
          'azure-responses-client',
          {
            status: response.status,
            hasData,
          }
        );
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

        logger.warn('Azure OpenAI response error', 'azure-responses-client', {
          message: normalizedError.message,
        });

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

    this.logCompletionStart(params, correlationId);

    if (this.clientConfig.enableCircuitBreaker) {
      return this.executeWithCircuitBreaker({
        params,
        correlationId,
        requestFormat,
        originalRequest,
        startTime,
        operation,
      });
    }

    if (this.clientConfig.enableRetry) {
      return this.executeWithRetry({
        params,
        correlationId,
        requestFormat,
        originalRequest,
        startTime,
        operation,
      });
    }

    return this.executeDirectRequest({
      params,
      correlationId,
      requestFormat,
      originalRequest,
      startTime,
      operation,
    });
  }

  private logCompletionStart(
    params: ResponsesCreateParams,
    correlationId: string
  ): void {
    logger.info('Creating Azure OpenAI completion', correlationId, {
      model: params.model,
      hasReasoning: !!params.reasoning,
      stream: params.stream,
      maxOutputTokens: params.max_output_tokens,
    });
  }

  private buildMetadata(
    attempts: number,
    totalDurationMs: number,
    circuitBreakerUsed: boolean,
    retryUsed: boolean,
    fallbackUsed: boolean,
    fallbackType?: string
  ): ClientResponse<ResponsesResponse>['metadata'] {
    return {
      attempts,
      totalDurationMs,
      circuitBreakerUsed,
      retryUsed,
      fallbackUsed,
      fallbackType,
    };
  }

  private createMappedErrorResponse(
    error: Error,
    correlationId: string,
    requestFormat: ResponseFormat,
    operation: string,
    metadata: ClientResponse<ResponsesResponse>['metadata']
  ): ClientResponse<ResponsesResponse> {
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
      metadata,
    };
  }

  private handleMissingData(
    correlationId: string,
    requestFormat: ResponseFormat,
    operation: string,
    metadata: ClientResponse<ResponsesResponse>['metadata']
  ): ClientResponse<ResponsesResponse> {
    const mappedError = AzureErrorMapper.createFallbackError(
      correlationId,
      requestFormat,
      operation
    );

    return {
      success: false,
      error: mappedError.clientResponse,
      metadata,
    };
  }

  private async executeWithCircuitBreaker({
    params,
    correlationId,
    requestFormat,
    originalRequest,
    startTime,
    operation,
  }: {
    params: ResponsesCreateParams;
    correlationId: string;
    requestFormat: ResponseFormat;
    originalRequest: UniversalRequest;
    startTime: number;
    operation: string;
  }): Promise<ClientResponse<ResponsesResponse>> {
    const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(
      this.circuitBreakerName
    );

    const circuitResult = await circuitBreaker.execute(
      () => this.executeCompletionRequest(params, correlationId),
      correlationId,
      operation
    );

    const metadata = this.buildMetadata(
      1,
      Date.now() - startTime,
      true,
      false,
      false
    );

    if (circuitResult.success) {
      if (!circuitResult.data) {
        return this.handleMissingData(
          correlationId,
          requestFormat,
          operation,
          metadata
        );
      }

      return {
        success: true,
        data: circuitResult.data,
        metadata,
      };
    }

    const circuitError =
      circuitResult.error ??
      new Error('Circuit breaker failed without providing an error');

    if (this.clientConfig.enableFallback) {
      return this.executeFallback(
        {
          correlationId,
          operation,
          requestFormat,
          originalRequest,
          error: circuitError,
          attempt: 1,
        },
        startTime
      );
    }

    return this.createMappedErrorResponse(
      circuitError,
      correlationId,
      requestFormat,
      operation,
      metadata
    );
  }

  private async executeWithRetry({
    params,
    correlationId,
    requestFormat,
    originalRequest,
    startTime,
    operation,
  }: {
    params: ResponsesCreateParams;
    correlationId: string;
    requestFormat: ResponseFormat;
    originalRequest: UniversalRequest;
    startTime: number;
    operation: string;
  }): Promise<ClientResponse<ResponsesResponse>> {
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

    const metadata = this.buildMetadata(
      retryResult.attempts,
      retryResult.totalDurationMs,
      false,
      true,
      false
    );

    if (retryResult.success) {
      if (!retryResult.data) {
        return this.handleMissingData(
          correlationId,
          requestFormat,
          operation,
          metadata
        );
      }

      return {
        success: true,
        data: retryResult.data,
        metadata: {
          ...metadata,
          retryUsed: retryResult.attempts > 1,
        },
      };
    }

    const retryError =
      retryResult.error ?? new Error('Retry failed without providing an error');

    if (this.clientConfig.enableFallback) {
      return this.executeFallback(
        {
          correlationId,
          operation,
          requestFormat,
          originalRequest,
          error: retryError,
          attempt: retryResult.attempts,
        },
        startTime
      );
    }

    return this.createMappedErrorResponse(
      retryError,
      correlationId,
      requestFormat,
      operation,
      metadata
    );
  }

  private async executeDirectRequest({
    params,
    correlationId,
    requestFormat,
    originalRequest,
    startTime,
    operation,
  }: {
    params: ResponsesCreateParams;
    correlationId: string;
    requestFormat: ResponseFormat;
    originalRequest: UniversalRequest;
    startTime: number;
    operation: string;
  }): Promise<ClientResponse<ResponsesResponse>> {
    try {
      const response = await this.executeCompletionRequest(
        params,
        correlationId
      );

      return {
        success: true,
        data: response,
        metadata: this.buildMetadata(
          1,
          Date.now() - startTime,
          false,
          false,
          false
        ),
      };
    } catch (error) {
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

      return this.createMappedErrorResponse(
        error instanceof Error
          ? error
          : new Error('Unexpected Azure completion error'),
        correlationId,
        requestFormat,
        operation,
        this.buildMetadata(
          1,
          Date.now() - startTime,
          false,
          false,
          false
        )
      );
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
      const response: AxiosResponse<ResponsesResponse> =
        await this.axiosClient.request(requestConfig);

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
    logger.warn(
      'Executing fallback for Azure OpenAI request',
      context.correlationId,
      {
        operation: context.operation,
        attempt: context.attempt,
      }
    );

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

      const fallbackError =
        fallbackResult.error ??
        AzureErrorMapper.createFallbackError(
          context.correlationId,
          context.requestFormat,
          context.operation
        ).clientResponse;

      return {
        success: false,
        error: fallbackError,
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
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Unknown error',
      });

      const fallbackErrorResponse =
        FallbackHandler.createFallbackError(context);

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

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
      ? circuitBreakerRegistry
          .getCircuitBreaker(this.circuitBreakerName)
          .getMetrics()
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
