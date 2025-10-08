import { Request, Response } from 'express';
import axios, { AxiosError, AxiosResponse } from 'axios';
import rateLimit from 'express-rate-limit';
import type { 
  RequestWithCorrelationId, 
  ServerConfig,
  ResponseTransformationResult,
  ClaudeError
} from '../types/index.js';
import { logger } from '../middleware/logging.js';
import { asyncErrorHandler } from '../middleware/error-handler.js';
import { 
  NetworkError,
  TimeoutError,
  AzureOpenAIError,
  ErrorFactory
} from '../errors/index.js';
import { 
  circuitBreakerRegistry,
  retryStrategyRegistry,
  gracefulDegradationManager
} from '../resilience/index.js';
import { 
  transformRequest,
  RequestTransformationError,
  ValidationError,
  SecurityError 
} from '../utils/request-transformer.js';
import { 
  transformAzureResponseToClaude,
  createDefensiveResponseHandler,
  extractErrorInfo,
  isAzureOpenAIError
} from '../utils/response-transformer.js';

/**
 * Robust /v1/completions proxy endpoint with comprehensive security and error handling
 * Transforms Claude API requests to Azure OpenAI format and back
 */

// Rate limiting specifically for completions endpoint
export const completionsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 completion requests per windowMs
  message: {
    error: {
      type: 'rate_limit_exceeded',
      message: 'Too many completion requests, please try again later.',
      correlationId: '',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const correlationId = (req as RequestWithCorrelationId).correlationId || 'unknown';
    
    logger.warn('Completions rate limit exceeded', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      url: req.url
    });

    res.status(429).json({
      error: {
        type: 'rate_limit_exceeded',
        message: 'Too many completion requests, please try again later.',
        correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Connection pool configuration for Azure OpenAI requests
const axiosInstance = axios.create({
  timeout: 60000, // 60 second timeout for completion requests
  maxRedirects: 0, // No redirects for security
  validateStatus: (status) => status < 600, // Don't throw on 4xx/5xx to handle errors gracefully
  headers: {
    'User-Agent': 'claude-to-azure-proxy/1.0.0'
  }
});

// Request/response correlation tracking
interface RequestMetrics {
  startTime: number;
  requestSize: number;
  transformationTime?: number;
  azureRequestTime?: number;
  responseTransformationTime?: number;
  totalTime?: number;
}

/**
 * Make Azure OpenAI request with circuit breaker and retry logic
 */
async function makeAzureRequestWithResilience(
  url: string,
  data: unknown,
  headers: Record<string, string>,
  correlationId: string
): Promise<AxiosResponse> {
  // Get circuit breaker for Azure OpenAI
  const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker('azure-openai', {
    failureThreshold: 5,
    recoveryTimeout: 60000,
    expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'AZURE_OPENAI_ERROR']
  });

  // Get retry strategy
  const retryStrategy = retryStrategyRegistry.getStrategy('azure-openai', {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    timeoutMs: 30000
  });

  // Execute with circuit breaker protection
  const circuitResult = await circuitBreaker.execute(async () => {
    // Execute with retry logic
    const retryResult = await retryStrategy.execute(async () => {
      try {
        logger.debug('Making Azure OpenAI request', correlationId, {
          url: url.replace(/\/[^/]+\.openai\.azure\.com/, '/[REDACTED].openai.azure.com')
        });
        
        const response = await axiosInstance.post(url, data, { headers });
        
        logger.debug('Azure OpenAI request successful', correlationId, {
          statusCode: response.status,
          responseSize: JSON.stringify(response.data).length
        });
        
        return response;
        
      } catch (error) {
        // Convert axios errors to our custom error types
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          
          if (axiosError.code === 'ECONNRESET' || 
              axiosError.code === 'ECONNREFUSED' || 
              axiosError.code === 'ENOTFOUND') {
            throw ErrorFactory.fromNetworkError(axiosError, correlationId, 'azure-openai-request');
          }
          
          if (axiosError.code === 'ETIMEDOUT') {
            throw ErrorFactory.fromTimeout(30000, correlationId, 'azure-openai-request');
          }
          
          if (axiosError.response?.data && isAzureOpenAIError(axiosError.response.data)) {
            throw ErrorFactory.fromAzureOpenAIError(
              axiosError.response.data,
              correlationId,
              'azure-openai-request'
            );
          }
        }
        
        throw error;
      }
    }, correlationId, 'azure-openai-request');

    if (retryResult.success && retryResult.data) {
      return retryResult.data;
    }
    
    throw retryResult.error || new Error('Request failed after all retry attempts');
  }, correlationId, 'azure-openai-request');

  if (circuitResult.success && circuitResult.data) {
    return circuitResult.data as AxiosResponse;
  }
  
  throw circuitResult.error || new Error('Circuit breaker prevented request execution');
}

/**
 * Main completions handler with comprehensive error handling and monitoring
 */
export const completionsHandler = (config: ServerConfig) => {
  return asyncErrorHandler(async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const metrics: RequestMetrics = {
      startTime: Date.now(),
      requestSize: JSON.stringify(req.body).length
    };
    
    // Create defensive response handler for fallback scenarios
    const defensiveHandler = createDefensiveResponseHandler(correlationId);
    
    try {
      logger.info('Completions request started', correlationId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestSize: metrics.requestSize
      });
      
      // Input validation and request transformation with error boundaries
      let transformationResult;
      const transformStart = Date.now();
      
      try {
        transformationResult = transformRequest(
          req.body,
          config.azureOpenAI.model,
          config.azureOpenAI.apiKey
        );
        
        metrics.transformationTime = Date.now() - transformStart;
        
        logger.debug('Request transformation successful', correlationId, {
          transformationTime: metrics.transformationTime,
          requestId: transformationResult.requestId
        });
        
      } catch (error) {
        metrics.transformationTime = Date.now() - transformStart;
        
        if (error instanceof ValidationError) {
          logger.warn('Request validation failed', correlationId, {
            error: error.message,
            details: error.details,
            transformationTime: metrics.transformationTime
          });
          
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: error.message
            }
          };
          
          res.status(400).json(claudeError);
          return;
        }
        
        if (error instanceof SecurityError) {
          logger.warn('Security validation failed', correlationId, {
            error: error.message,
            transformationTime: metrics.transformationTime
          });
          
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'Request contains invalid or potentially harmful content'
            }
          };
          
          res.status(400).json(claudeError);
          return;
        }
        
        if (error instanceof RequestTransformationError) {
          logger.error('Request transformation error', correlationId, {
            error: error.message,
            code: error.code,
            transformationTime: metrics.transformationTime
          });
          
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: 'internal_error',
              message: 'Failed to process request'
            }
          };
          
          res.status(500).json(claudeError);
          return;
        }
        
        // Unexpected transformation error
        logger.error('Unexpected transformation error', correlationId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          transformationTime: metrics.transformationTime
        });
        
        const result = defensiveHandler(null, 500);
        res.status(result.statusCode).set(result.headers).json(result.claudeResponse);
        return;
      }
      
      // Forward request to Azure OpenAI with circuit breaker and retry logic
      let azureResponse: AxiosResponse;
      const azureRequestStart = Date.now();
      
      try {
        const azureUrl = `${config.azureOpenAI.endpoint}/openai/v1/chat/completions`;
        
        azureResponse = await makeAzureRequestWithResilience(
          azureUrl,
          transformationResult.azureRequest,
          transformationResult.headers as unknown as Record<string, string>,
          correlationId
        );
        
        metrics.azureRequestTime = Date.now() - azureRequestStart;
        
        logger.debug('Azure OpenAI request completed', correlationId, {
          statusCode: azureResponse.status,
          azureRequestTime: metrics.azureRequestTime,
          responseSize: JSON.stringify(azureResponse.data).length
        });
        
      } catch (error) {
        metrics.azureRequestTime = Date.now() - azureRequestStart;
        
        // Try graceful degradation for Azure OpenAI failures
        try {
          const degradationResult = await gracefulDegradationManager.executeGracefulDegradation({
            correlationId,
            operation: 'completions',
            error: error as Error,
            attempt: 1,
            metadata: { azureRequestTime: metrics.azureRequestTime }
          });

          if (degradationResult.success) {
            logger.info('Graceful degradation successful', correlationId, {
              fallback: degradationResult.fallbackUsed,
              degraded: degradationResult.degraded
            });

            res.status(200).json(degradationResult.data);
            return;
          } else {
            // Graceful degradation failed, return appropriate error response
            logger.warn('Graceful degradation failed', correlationId, { 
              originalError: error instanceof Error ? error.message : 'Unknown error', 
              degradationError: degradationResult.message 
            });
            
            // Extract status code and error data from original error
            let statusCode = 500;
            let errorData: any = degradationResult.message;
            
            if (error && typeof error === 'object' && 'response' in error) {
              const axiosError = error as any;
              statusCode = axiosError.response?.status || 500;
              errorData = axiosError.response?.data || degradationResult.message;
            }
            
            // Ensure we have a valid error structure for transformation
            if (!errorData || typeof errorData !== 'object') {
              // Create a fallback error structure
              errorData = {
                error: {
                  type: statusCode === 401 ? 'authentication_error' : 
                        statusCode === 429 ? 'rate_limit_error' : 
                        statusCode === 400 ? 'invalid_request_error' : 'api_error',
                  message: error instanceof Error ? error.message : 'An error occurred while processing your request'
                }
              };
            }
            
            // Transform Azure error to Claude format
            const result = transformAzureResponseToClaude(errorData, statusCode, correlationId);
            res.status(result.statusCode).set(result.headers).json(result.claudeResponse);
            return;
          }
        } catch (degradationError) {
          logger.warn('Graceful degradation exception', correlationId, {
            originalError: error instanceof Error ? error.message : 'Unknown error',
            degradationError: degradationError instanceof Error ? degradationError.message : 'Unknown error'
          });
          // Fall through to regular error handling
        }

        // Handle specific error types
        if (error instanceof NetworkError) {
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: 'api_error',
              message: 'Failed to connect to Azure OpenAI service'
            }
          };
          
          res.status(503).json(claudeError);
          return;
        }

        if (error instanceof TimeoutError) {
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: 'timeout_error',
              message: 'Request timed out'
            }
          };
          
          res.status(408).json(claudeError);
          return;
        }

        if (error instanceof AzureOpenAIError) {
          const claudeError: ClaudeError = {
            type: 'error',
            error: {
              type: error.azureErrorType || 'api_error',
              message: error.message
            }
          };
          
          res.status(error.statusCode).json(claudeError);
          return;
        }
        
        // Fallback to defensive handler for unexpected errors
        logger.error('Unexpected Azure request error', correlationId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          azureRequestTime: metrics.azureRequestTime
        });
        
        const result = defensiveHandler(null, 503);
        res.status(result.statusCode).set(result.headers).json(result.claudeResponse);
        return;
      }
      
      // Transform response with fallback mechanisms
      let responseTransformationResult: ResponseTransformationResult;
      const responseTransformStart = Date.now();
      
      try {
        responseTransformationResult = transformAzureResponseToClaude(
          azureResponse.data,
          azureResponse.status,
          correlationId
        );
        
        metrics.responseTransformationTime = Date.now() - responseTransformStart;
        
        logger.debug('Response transformation successful', correlationId, {
          responseTransformationTime: metrics.responseTransformationTime
        });
        
      } catch (error) {
        metrics.responseTransformationTime = Date.now() - responseTransformStart;
        
        logger.error('Response transformation failed, using defensive handler', correlationId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTransformationTime: metrics.responseTransformationTime
        });
        
        responseTransformationResult = defensiveHandler(azureResponse.data, azureResponse.status);
      }
      
      // Calculate total processing time
      metrics.totalTime = Date.now() - metrics.startTime;
      
      // Performance monitoring and logging
      logger.info('Completions request completed', correlationId, {
        statusCode: responseTransformationResult.statusCode,
        totalTime: metrics.totalTime,
        requestSize: metrics.requestSize,
        transformationTime: metrics.transformationTime,
        azureRequestTime: metrics.azureRequestTime,
        responseTransformationTime: metrics.responseTransformationTime,
        responseSize: JSON.stringify(responseTransformationResult.claudeResponse).length
      });
      
      // Performance warning for slow requests
      if (metrics.totalTime > 30000) { // 30 seconds
        logger.warn('Slow completion request detected', correlationId, {
          totalTime: metrics.totalTime,
          breakdown: {
            transformation: metrics.transformationTime,
            azureRequest: metrics.azureRequestTime,
            responseTransformation: metrics.responseTransformationTime
          }
        });
      }
      
      // Send response with proper headers
      res.status(responseTransformationResult.statusCode)
         .set(responseTransformationResult.headers)
         .json(responseTransformationResult.claudeResponse);
      
    } catch (error) {
      // Global error handler for unexpected errors
      metrics.totalTime = Date.now() - metrics.startTime;
      
      logger.error('Unexpected error in completions handler', correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        totalTime: metrics.totalTime,
        requestSize: metrics.requestSize
      });
      
      // Use defensive handler for unexpected errors
      const result = defensiveHandler(null, 500);
      res.status(result.statusCode).set(result.headers).json(result.claudeResponse);
    }
  });
};

/**
 * Combined completions middleware with rate limiting and authentication
 * Rate limiting is applied before the main handler to prevent resource exhaustion
 */
export const secureCompletionsHandler = (config: ServerConfig) => [
  completionsRateLimit,
  completionsHandler(config)
];
