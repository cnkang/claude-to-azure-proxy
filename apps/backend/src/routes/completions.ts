import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import type {
  RequestWithCorrelationId,
  ServerConfig,
  IncomingRequest,
  ResponsesResponse,
  ResponseFormat,
  ClaudeRequest,
  ClaudeResponse,
  OpenAIResponse,
  ClaudeError,
  OpenAIError,
  ModelRoutingConfig,
  ModelRoutingDecision,
} from '../types/index.js';
import { logger } from '../middleware/logging';
import { asyncErrorHandler } from '../middleware/error-handler';
import {
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
} from '../errors/index';
import {
  circuitBreakerRegistry,
  retryStrategyRegistry,
  gracefulDegradationManager,
} from '../resilience/index';
import { AzureResponsesClient } from '../clients/azure-responses-client';
import {
  createUniversalRequestProcessor,
  defaultUniversalProcessorConfig,
} from '../utils/universal-request-processor';
import { ALLOWED_MODELS } from '../validation/joi-validators';
import { createReasoningEffortAnalyzer } from '../utils/reasoning-effort-analyzer';
import { conversationManager } from '../utils/conversation-manager';
import config, {
  createAWSBedrockConfig,
  isAWSBedrockConfigured,
} from '../config/index';
import { createErrorResponseByFormat } from '../utils/response-transformer';
import {
  detectRequestFormat,
  getResponseFormat,
} from '../utils/format-detection';
import {
  createAbortError,
  isAbortError,
  throwIfAborted,
  abortableDelay,
} from '../utils/abort-utils';

import {
  createAbortableStreamWriter,
  endResponseOnAbort,
} from '../utils/streaming-helpers';

import { transformResponsesToClaude } from '../utils/responses-to-claude-transformer';
import { transformResponsesToOpenAI } from '../utils/responses-to-openai-transformer';
import { AzureErrorMapper } from '../utils/azure-error-mapper';
import { ensureResponsesBaseURL } from '../utils/azure-endpoint';
import { AWSBedrockClient } from '../clients/aws-bedrock-client';

import { getHealthMonitor } from '../monitoring/health-monitor';
import { completionsRateLimitHandler } from './completions-rate-limit-handler';
import { resolveRateLimitConfig } from '../middleware/security';
export { completionsRateLimitHandler } from './completions-rate-limit-handler';

/**
 * Robust /v1/completions proxy endpoint with comprehensive security and error handling
 * Transforms Claude API requests to Azure OpenAI format and back
 */

const completionsRateLimitConfig = resolveRateLimitConfig(
  {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many completion requests, please try again later.',
  },
  'API'
);

// Rate limiting specifically for completions endpoint
export const completionsRateLimit = rateLimit({
  windowMs: completionsRateLimitConfig.windowMs,
  max: completionsRateLimitConfig.maxRequests,
  message: {
    error: {
      type: 'rate_limit_exceeded',
      message: completionsRateLimitConfig.message,
      correlationId: '',
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: completionsRateLimitHandler,
});

// Request/response correlation tracking
interface RequestMetrics {
  startTime: number;
  requestSize: number;
  formatDetectionTime?: number;
  reasoningAnalysisTime?: number;
  transformationTime?: number;
  azureRequestTime?: number;
  bedrockRequestTime?: number;
  responseTransformationTime?: number;
  totalTime?: number;
}

// Initialize universal request processor with configuration from environment
const CLAUDE_MODEL_ALIASES = ALLOWED_MODELS.filter(
  (model) => typeof model === 'string' && model.startsWith('claude-')
);

const AZURE_MODEL_ALIASES = Array.from(
  new Set(
    [
      config.AZURE_OPENAI_MODEL,
      'gpt-5-codex',
      'gpt-4',
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      ...CLAUDE_MODEL_ALIASES,
    ].filter(
      (alias): alias is string =>
        typeof alias === 'string' && alias.trim().length > 0
    )
  )
);

const BEDROCK_MODEL_ID = 'qwen.qwen3-coder-480b-a35b-v1:0';
const BEDROCK_MODEL_ALIASES = ['qwen-3-coder', BEDROCK_MODEL_ID] as const;

const bedrockConfiguration = isAWSBedrockConfigured(config)
  ? createAWSBedrockConfig(config)
  : null;

const bedrockClientSingleton =
  bedrockConfiguration !== null
    ? new AWSBedrockClient(bedrockConfiguration)
    : null;

const modelRoutingConfig: ModelRoutingConfig = {
  defaultProvider: 'azure',
  defaultModel: config.AZURE_OPENAI_MODEL,
  entries: [
    {
      provider: 'azure',
      backendModel: config.AZURE_OPENAI_MODEL,
      aliases: AZURE_MODEL_ALIASES,
    },
    ...(bedrockClientSingleton !== null
      ? [
          {
            provider: 'bedrock' as const,
            backendModel: BEDROCK_MODEL_ID,
            aliases: BEDROCK_MODEL_ALIASES,
          },
        ]
      : []),
  ],
};

const universalProcessor = createUniversalRequestProcessor({
  ...defaultUniversalProcessorConfig,
  enableContentSecurityValidation: config.ENABLE_CONTENT_SECURITY_VALIDATION,
  modelRouting: modelRoutingConfig,
});

// Initialize reasoning effort analyzer
const reasoningAnalyzer = createReasoningEffortAnalyzer();

/**
 * Make Azure Responses API request with circuit breaker and retry logic
 */
async function makeResponsesAPIRequestWithResilience(
  client: AzureResponsesClient,
  params: import('../types/index.js').ResponsesCreateParams,
  correlationId: string,
  signal?: AbortSignal
): Promise<ResponsesResponse> {
  throwIfAborted(signal, 'Azure Responses request aborted before execution');

  // Get circuit breaker for Azure OpenAI
  const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(
    'azure-responses-api',
    {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'AZURE_OPENAI_ERROR'],
    }
  );

  // Get retry strategy
  const retryStrategy = retryStrategyRegistry.getStrategy(
    'azure-responses-api',
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      timeoutMs: config.AZURE_OPENAI_TIMEOUT,
    }
  );

  // Execute with circuit breaker protection
  const circuitResult = await circuitBreaker.execute(
    async () => {
      // Execute with retry logic
      const retryResult = await retryStrategy.execute(
        async () => {
          try {
            logger.debug('Making Azure Responses API request', correlationId, {
              model: params.model,
              hasReasoning: Boolean(params.reasoning),
              reasoningEffort: params.reasoning?.effort,
              inputType: typeof params.input,
              inputLength: Array.isArray(params.input)
                ? params.input.length
                : typeof params.input === 'string'
                  ? params.input.length
                  : 0,
            });

            const response = await client.createResponse(params, signal);

            logger.debug(
              'Azure Responses API request successful',
              correlationId,
              {
                responseId: response.id,
                outputCount: response.output.length,
                totalTokens: response.usage.total_tokens,
                reasoningTokens: response.usage.reasoning_tokens,
              }
            );

            return response;
          } catch (error) {
            // Re-throw our custom errors as-is
            if (
              error instanceof ValidationError ||
              error instanceof AzureOpenAIError
            ) {
              throw error;
            }

            // Convert other errors to our custom error types
            if (error instanceof Error) {
              if (error.message.includes('timeout')) {
                throw ErrorFactory.fromTimeout(
                  config.AZURE_OPENAI_TIMEOUT,
                  correlationId,
                  'azure-responses-api-request'
                );
              }

              if (
                error.message.includes('network') ||
                error.message.includes('ECONNREFUSED')
              ) {
                throw ErrorFactory.fromNetworkError(
                  error,
                  correlationId,
                  'azure-responses-api-request'
                );
              }
            }

            throw error;
          }
        },
        correlationId,
        'azure-responses-api-request',
        signal
      );

      if (retryResult.success && retryResult.data !== undefined) {
        return retryResult.data;
      }

      const retryFailureError =
        retryResult.error ??
        new Error('Request failed after all retry attempts');
      throw retryFailureError;
    },
    correlationId,
    'azure-responses-api-request'
  );

  if (circuitResult.success && circuitResult.data !== undefined) {
    return circuitResult.data;
  }

  const circuitFailureError =
    circuitResult.error ??
    new Error('Circuit breaker prevented request execution');
  throw circuitFailureError;
}

const createJsonHeaders = (correlationId: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Correlation-ID': correlationId,
});

const isResponsesApiResponse = (value: unknown): value is ResponsesResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { object?: unknown; output?: unknown };
  return candidate.object === 'response' && Array.isArray(candidate.output);
};

interface FormattedSuccessResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body:
    | (ClaudeResponse & { readonly correlationId: string })
    | (OpenAIResponse & { readonly correlationId: string });
}

const buildSuccessResponse = (
  responsesResponse: ResponsesResponse,
  responseFormat: ResponseFormat,
  correlationId: string
): FormattedSuccessResponse => {
  const headers = createJsonHeaders(correlationId);

  if (responseFormat === 'claude') {
    const claudeResponse = transformResponsesToClaude(
      responsesResponse,
      correlationId
    );
    return {
      statusCode: 200,
      headers,
      body: {
        ...claudeResponse,
        correlationId,
      },
    };
  }

  const openAIResponse = transformResponsesToOpenAI(
    responsesResponse,
    correlationId
  );

  return {
    statusCode: 200,
    headers,
    body: {
      ...openAIResponse,
      correlationId,
    },
  };
};

const buildFallbackResponse = (
  fallbackData: unknown,
  responseFormat: ResponseFormat,
  correlationId: string
): FormattedSuccessResponse => {
  if (isResponsesApiResponse(fallbackData)) {
    return buildSuccessResponse(fallbackData, responseFormat, correlationId);
  }

  const headers = createJsonHeaders(correlationId);
  const fallbackObject =
    typeof fallbackData === 'object' && fallbackData !== null
      ? (fallbackData as Record<string, unknown>)
      : {};
  const fallbackId =
    typeof fallbackObject.id === 'string'
      ? fallbackObject.id
      : `fallback_${Date.now()}`;
  const fallbackModel =
    typeof fallbackObject.model === 'string'
      ? fallbackObject.model
      : responseFormat === 'claude'
        ? 'claude-3-5-sonnet-20241022'
        : 'gpt-4';
  const fallbackMessage =
    typeof fallbackObject.completion === 'string'
      ? fallbackObject.completion
      : 'The service is temporarily unavailable. Please try again later.';

  if (responseFormat === 'claude') {
    const claudeFallback: ClaudeResponse & { readonly correlationId: string } =
      {
        id: fallbackId,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: fallbackMessage,
          },
        ],
        model: fallbackModel,
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
        correlationId,
      };

    return {
      statusCode: 200,
      headers,
      body: claudeFallback,
    };
  }

  const openAIFallback: OpenAIResponse & { readonly correlationId: string } = {
    id: fallbackId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: fallbackModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: fallbackMessage,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    correlationId,
  };

  return {
    statusCode: 200,
    headers,
    body: openAIFallback,
  };
};

const mapErrorToClientResponse = (
  error: unknown,
  correlationId: string,
  responseFormat: ResponseFormat
): {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body:
    | (ClaudeError & {
        readonly correlationId: string;
        readonly timestamp: string;
      })
    | (OpenAIError & {
        readonly correlationId: string;
        readonly timestamp: string;
      });
} => {
  const originalError = unwrapAzureError(error);
  const mapped = AzureErrorMapper.mapError({
    correlationId,
    operation: 'responses-api-completions',
    requestFormat: responseFormat,
    originalError,
  });

  const headers = createJsonHeaders(correlationId);
  const timestamp = new Date().toISOString();

  if (responseFormat === 'claude') {
    const body: ClaudeError & {
      readonly correlationId: string;
      readonly timestamp: string;
    } = {
      ...(mapped.clientResponse as ClaudeError),
      correlationId,
      timestamp,
    };

    return {
      statusCode: mapped.error.statusCode,
      headers,
      body,
    };
  }

  const body: OpenAIError & {
    readonly correlationId: string;
    readonly timestamp: string;
  } = {
    ...(mapped.clientResponse as OpenAIError),
    correlationId,
    timestamp,
  };

  return {
    statusCode: mapped.error.statusCode,
    headers,
    body,
  };
};

const unwrapAzureError = (error: unknown): unknown => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: unknown } }).response?.data !== undefined
  ) {
    return (error as { response: { data: unknown } }).response.data;
  }

  return error;
};

/**
 * Main completions handler with comprehensive error handling and monitoring
 * Now uses Azure OpenAI Responses API with intelligent reasoning effort analysis
 */
export const completionsHandler = (config: Readonly<ServerConfig>) => {
  return asyncErrorHandler<RequestWithCorrelationId>(
    async (req: RequestWithCorrelationId, res: Response): Promise<void> => {
      const { correlationId } = req;
      const metrics: RequestMetrics = {
        startTime: Date.now(),
        requestSize: JSON.stringify(req.body).length,
      };

      const abortController = new AbortController();
      const abortRequest = (): void => {
        if (!abortController.signal.aborted) {
          abortController.abort(
            createAbortError('Client connection closed during request')
          );
        }
      };

      req.on('close', abortRequest);
      req.on('aborted', abortRequest);

      try {
        // Detect request format to determine response format
        const formatDetectionStart = Date.now();
        const incomingRequest: IncomingRequest = {
          headers: req.headers as Record<string, string>,
          body: req.body,
          path: req.path,
          userAgent: req.headers['user-agent'],
        };

        const requestModel =
          typeof req.body === 'object' && req.body !== null
            ? (req.body as { model?: unknown }).model
            : undefined;

        let requestFormat = detectRequestFormat(incomingRequest);
        if (
          requestFormat === 'claude' &&
          typeof requestModel === 'string' &&
          !requestModel.startsWith('claude-') &&
          !incomingRequest.path.toLowerCase().startsWith('/v1/messages')
        ) {
          requestFormat = 'openai';
        }

        const responseFormat = getResponseFormat(requestFormat);
        metrics.formatDetectionTime = Date.now() - formatDetectionStart;

        logger.info('Completions request started', correlationId, {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestSize: metrics.requestSize,
          requestFormat,
          responseFormat,
          formatDetectionTime: metrics.formatDetectionTime,
        });

        // Validate Azure OpenAI configuration
        if (!config.azureOpenAI) {
          throw new ValidationError(
            'Azure OpenAI configuration is missing',
            correlationId,
            'config',
            'missing'
          );
        }

        const azureSourceConfig = config.azureOpenAI;
        const endpointCandidate =
          typeof azureSourceConfig.baseURL === 'string' &&
          azureSourceConfig.baseURL.trim().length > 0
            ? azureSourceConfig.baseURL.trim()
            : azureSourceConfig.endpoint;

        if (
          endpointCandidate === undefined ||
          typeof endpointCandidate !== 'string' ||
          endpointCandidate.trim().length === 0
        ) {
          throw new ValidationError(
            'Azure OpenAI endpoint is missing',
            correlationId,
            'config.azureOpenAI.endpoint',
            endpointCandidate
          );
        }

        const requiredDeployment =
          azureSourceConfig.deployment ?? azureSourceConfig.model;

        if (
          requiredDeployment === undefined ||
          requiredDeployment.trim().length === 0
        ) {
          throw new ValidationError(
            'Azure OpenAI deployment is missing',
            correlationId,
            'config.azureOpenAI.deployment',
            requiredDeployment
          );
        }

        if (
          typeof azureSourceConfig.apiKey !== 'string' ||
          azureSourceConfig.apiKey.trim().length === 0
        ) {
          throw new ValidationError(
            'Azure OpenAI API key is missing',
            correlationId,
            'config.azureOpenAI.apiKey',
            azureSourceConfig.apiKey
          );
        }

        const baseURL = ensureResponsesBaseURL(endpointCandidate);

        const timeoutRaw = azureSourceConfig.timeout ?? 120000;
        const timeoutMs =
          typeof timeoutRaw === 'number' ? timeoutRaw : Number(timeoutRaw);
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
          throw new ValidationError(
            'Azure OpenAI timeout must be a positive number',
            correlationId,
            'config.azureOpenAI.timeout',
            timeoutRaw
          );
        }

        const retriesRaw = azureSourceConfig.maxRetries ?? 3;
        const maxRetries =
          typeof retriesRaw === 'number' ? retriesRaw : Number(retriesRaw);
        if (!Number.isInteger(maxRetries) || maxRetries < 0) {
          throw new ValidationError(
            'Azure OpenAI maxRetries must be a non-negative integer',
            correlationId,
            'config.azureOpenAI.maxRetries',
            retriesRaw
          );
        }

        // Create Azure OpenAI configuration from ServerConfig
        // API version is now embedded in the baseURL (v1)

        const azureConfig: import('../types/index.js').AzureOpenAIConfig = {
          baseURL,
          apiKey: azureSourceConfig.apiKey.trim(),
          // API version is embedded in baseURL, no need to set separately
          deployment: requiredDeployment.trim(),
          timeout: timeoutMs,
          maxRetries,
        };

        // Create Azure Responses API client
        const responsesClient = new AzureResponsesClient(azureConfig);

        // Extract conversation ID for context tracking
        const headerConversationIdRaw =
          req.headers['x-conversation-id'] ??
          req.headers['conversation-id'] ??
          req.headers['x-session-id'] ??
          req.headers['session-id'] ??
          req.headers['x-thread-id'] ??
          req.headers['thread-id'];

        const headerConversationId =
          Array.isArray(headerConversationIdRaw) &&
          headerConversationIdRaw.length > 0
            ? headerConversationIdRaw[0]
            : headerConversationIdRaw;

        const conversationId =
          typeof headerConversationId === 'string' &&
          headerConversationId.trim().length > 0
            ? headerConversationId.trim()
            : conversationManager.extractConversationId(
                req.headers as Record<string, string>,
                correlationId
              );

        // Get conversation context for reasoning adjustment
        const conversationContext =
          conversationManager.getConversationContext(conversationId);

        // Process request with universal processor
        const transformationStart = Date.now();
        const processingResult = await universalProcessor.processRequest(
          incomingRequest,
          conversationContext
        );
        metrics.transformationTime = Date.now() - transformationStart;

        logger.debug('Request processing completed', correlationId, {
          requestFormat: processingResult.requestFormat,
          responseFormat: processingResult.responseFormat,
          conversationId: processingResult.conversationId,
          estimatedComplexity: processingResult.estimatedComplexity,
          reasoningEffort: processingResult.reasoningEffort,
          transformationTime: metrics.transformationTime,
        });

        let { responsesParams } = processingResult;
        const routingDecision = processingResult.routingDecision;

        // Add previous_response_id for conversation continuity
        const previousResponseId =
          conversationManager.getPreviousResponseId(conversationId);

        if (
          typeof previousResponseId === 'string' &&
          previousResponseId.length > 0
        ) {
          responsesParams = {
            ...responsesParams,
            previous_response_id: previousResponseId,
          };
        }

        if (processingResult.requestFormat === 'claude') {
          const normalizedRequest =
            processingResult.normalizedRequest as ClaudeRequest;
          const analyzerEffort = reasoningAnalyzer.analyzeRequest(
            normalizedRequest,
            conversationContext
          );

          if (
            analyzerEffort !== undefined &&
            analyzerEffort !== responsesParams.reasoning?.effort
          ) {
            responsesParams = {
              ...responsesParams,
              reasoning: {
                effort: analyzerEffort,
              },
            };
          }

          if (typeof responsesParams.input === 'string') {
            responsesParams = {
              ...responsesParams,
              input: [
                {
                  role: 'user',
                  content: responsesParams.input,
                },
              ],
            };
          }
        }

        const finalReasoningEffort =
          responsesParams.reasoning?.effort ?? processingResult.reasoningEffort;

        // Check if streaming is requested by client
        const isStreamingRequest = responsesParams.stream === true;

        if (routingDecision.provider === 'bedrock') {
          if (bedrockClientSingleton === null) {
            throw new ValidationError(
              'AWS Bedrock configuration is missing',
              correlationId,
              'config.awsBedrock',
              'missing'
            );
          }

          await handleBedrockRequest(
            bedrockClientSingleton,
            {
              ...processingResult,
              responsesParams,
              reasoningEffort: finalReasoningEffort,
            },
            conversationId,
            responseFormat,
            correlationId,
            req,
            res,
            metrics,
            routingDecision,
            abortController.signal
          );
          return;
        }

        // Always use non-streaming for Azure requests, but simulate streaming for client if needed
        const azureParams = {
          ...responsesParams,
          model: routingDecision.backendModel,
          stream: false, // Force non-streaming for Azure
        };

        // Always use non-streaming for Azure requests, but simulate streaming for client if needed
        if (isStreamingRequest) {
          // Handle client streaming request with non-streaming Azure backend
          await handleSimulatedStreamingRequest(
            responsesClient,
            {
              ...processingResult,
              responsesParams: azureParams,
              reasoningEffort: finalReasoningEffort,
            },
            conversationId,
            responseFormat,
            correlationId,
            req,
            res,
            metrics,
            abortController.signal
          );
          return;
        }

        // Make non-streaming request to Azure Responses API with circuit breaker and retry logic
        let responsesAPIResponse: ResponsesResponse;
        const azureRequestStart = Date.now();

        try {
          responsesAPIResponse = await makeResponsesAPIRequestWithResilience(
            responsesClient,
            azureParams, // Use non-streaming params
            correlationId,
            abortController.signal
          );

          metrics.azureRequestTime = Date.now() - azureRequestStart;

          logger.debug('Azure Responses API request completed', correlationId, {
            responseId: responsesAPIResponse.id,
            azureRequestTime: metrics.azureRequestTime,
            outputCount: responsesAPIResponse.output.length,
            totalTokens: responsesAPIResponse.usage.total_tokens,
            reasoningTokens: responsesAPIResponse.usage.reasoning_tokens,
          });

          // Track conversation for continuity

          conversationManager.trackConversation(
            conversationId,
            responsesAPIResponse.id,
            {
              totalTokensUsed: responsesAPIResponse.usage.total_tokens,
              reasoningTokensUsed:
                responsesAPIResponse.usage.reasoning_tokens ?? 0,
              averageResponseTime: metrics.azureRequestTime,
              errorCount: 0,
            }
          );
        } catch (error) {
          metrics.azureRequestTime = Date.now() - azureRequestStart;

          if (isAbortError(error) || abortController.signal.aborted) {
            logger.info('Azure Responses request aborted by client', correlationId, {
              azureRequestTime: metrics.azureRequestTime,
            });
            return;
          }

          // Update conversation with error
          conversationManager.updateConversationMetrics(conversationId, {
            errorCount: (conversationContext?.totalTokensUsed ?? 0) > 0 ? 1 : 0,
          });

          // Try graceful degradation for Azure Responses API failures
          const axiosStatus =
            typeof (error as { response?: { status?: number } }).response
              ?.status === 'number'
              ? (error as { response: { status: number } }).response.status
              : undefined;

          const derivedStatus =
            error instanceof AzureOpenAIError
              ? error.statusCode
              : error instanceof ValidationError
                ? 400
                : axiosStatus;

          const shouldAttemptDegradation =
            derivedStatus === undefined || derivedStatus >= 500;

          if (shouldAttemptDegradation) {
            try {
              const degradationResult =
                await gracefulDegradationManager.executeGracefulDegradation({
                  correlationId,
                  operation: 'responses-api-completions',
                  error: error as Error,
                  attempt: 1,
                  metadata: { azureRequestTime: metrics.azureRequestTime },
                });

              if (degradationResult.success) {
                logger.info('Graceful degradation successful', correlationId, {
                  fallback: degradationResult.fallbackUsed,
                  degraded: degradationResult.degraded,
                });

                const fallbackResult = buildFallbackResponse(
                  degradationResult.data,
                  responseFormat,
                  correlationId
                );

                res
                  .status(fallbackResult.statusCode)
                  .set(fallbackResult.headers)
                  .json(fallbackResult.body);
                return;
              }
            } catch (degradationError) {
              logger.warn('Graceful degradation exception', correlationId, {
                originalError:
                  error instanceof Error ? error.message : 'Unknown error',
                degradationError:
                  degradationError instanceof Error
                    ? degradationError.message
                    : 'Unknown error',
              });
            }
          }

          // Handle specific error types
          if (error instanceof ValidationError) {
            const errorResponse = createErrorResponseByFormat(
              'invalid_request_error',
              error.message,
              400,
              correlationId,
              responseFormat
            );

            res
              .status(errorResponse.statusCode)
              .set(errorResponse.headers)
              .json(errorResponse.response);
            return;
          }

          if (error instanceof AzureOpenAIError) {
            let errorType:
              | 'invalid_request_error'
              | 'authentication_error'
              | 'rate_limit_error'
              | 'api_error' = 'api_error';

            if (error.azureErrorType === 'invalid_request_error') {
              errorType = 'invalid_request_error';
            } else if (error.azureErrorType === 'authentication_error') {
              errorType = 'authentication_error';
            } else if (error.azureErrorType === 'rate_limit_error') {
              errorType = 'rate_limit_error';
            }

            const errorResponse = createErrorResponseByFormat(
              errorType,
              error.message,
              error.statusCode,
              correlationId,
              responseFormat
            );

            res
              .status(errorResponse.statusCode)
              .set(errorResponse.headers)
              .json(errorResponse.response);
            return;
          }

          const mappedError = mapErrorToClientResponse(
            error,
            correlationId,
            responseFormat
          );

          res
            .status(mappedError.statusCode)
            .set(mappedError.headers)
            .json(mappedError.body);
          return;
        }

        // Transform Responses API response to appropriate format
        const responseTransformStart = Date.now();
        let responseTransformationResult;

        try {
          const normalizedResponse: ResponsesResponse = {
            ...responsesAPIResponse,
            model: routingDecision.requestedModel,
          };

          responseTransformationResult = buildSuccessResponse(
            normalizedResponse,
            responseFormat,
            correlationId
          );

          metrics.responseTransformationTime =
            Date.now() - responseTransformStart;

          logger.debug('Response transformation successful', correlationId, {
            responseTransformationTime: metrics.responseTransformationTime,
            responseFormat,
            outputCount: responsesAPIResponse.output.length,
          });
        } catch (error) {
          metrics.responseTransformationTime =
            Date.now() - responseTransformStart;

          logger.error('Response transformation failed', correlationId, {
            error: error instanceof Error ? error.message : 'Unknown error',
            responseTransformationTime: metrics.responseTransformationTime,
          });

          // Create fallback error response
          const errorResponse = createErrorResponseByFormat(
            'api_error',
            'Failed to transform response',
            500,
            correlationId,
            responseFormat
          );

          res
            .status(errorResponse.statusCode)
            .set(errorResponse.headers)
            .json(errorResponse.response);
          return;
        }

        // Calculate total processing time
        metrics.totalTime = Date.now() - metrics.startTime;

        // Performance monitoring and logging
        logger.info('Completions request completed', correlationId, {
          statusCode: responseTransformationResult.statusCode,
          totalTime: metrics.totalTime,
          requestSize: metrics.requestSize,
          formatDetectionTime: metrics.formatDetectionTime,
          transformationTime: metrics.transformationTime,
          azureRequestTime: metrics.azureRequestTime,
          responseTransformationTime: metrics.responseTransformationTime,
          responseSize: JSON.stringify(responseTransformationResult.body)
            .length,
          responseFormat,
          conversationId,
          reasoningEffort: finalReasoningEffort,
          estimatedComplexity: processingResult.estimatedComplexity,
          totalTokens: responsesAPIResponse.usage.total_tokens,
          reasoningTokens: responsesAPIResponse.usage.reasoning_tokens,
        });

        // Performance warning for slow requests
        if (metrics.totalTime > timeoutMs * 0.25) {
          // 25% of configured timeout
          logger.warn('Slow completion request detected', correlationId, {
            totalTime: metrics.totalTime,
            breakdown: {
              formatDetection: metrics.formatDetectionTime,
              transformation: metrics.transformationTime,
              azureRequest: metrics.azureRequestTime,
              responseTransformation: metrics.responseTransformationTime,
            },
            conversationId,
            reasoningEffort: finalReasoningEffort,
          });
        }

        // Send response with proper headers
        res
          .status(responseTransformationResult.statusCode)
          .set(responseTransformationResult.headers)
          .json(responseTransformationResult.body);
      } catch (error) {
        if (isAbortError(error) || abortController.signal.aborted) {
          logger.info('Completions request aborted by client', correlationId, {
            totalTime: Date.now() - metrics.startTime,
          });
          return;
        }

        // Global error handler for unexpected errors
        metrics.totalTime = Date.now() - metrics.startTime;

        logger.error('Unexpected error in completions handler', correlationId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          totalTime: metrics.totalTime,
          requestSize: metrics.requestSize,
        });

        // Determine response format for error response
        let errorResponseFormat: ResponseFormat = 'claude';
        try {
          const incomingRequest: IncomingRequest = {
            headers: req.headers as Record<string, string>,
            body: req.body,
            path: req.path,
            userAgent: req.headers['user-agent'],
          };
          const detectedFormat = detectRequestFormat(incomingRequest);
          errorResponseFormat = getResponseFormat(detectedFormat);
        } catch {
          // Fallback to Claude format if detection fails
          errorResponseFormat = 'claude';
        }

        if (error instanceof ValidationError) {
          const errorResponse = createErrorResponseByFormat(
            'invalid_request_error',
            error.message,
            400,
            correlationId,
            errorResponseFormat
          );

          res
            .status(errorResponse.statusCode)
            .set(errorResponse.headers)
            .json(errorResponse.response);
          return;
        }

        // Create appropriate error response
        const mappedError = mapErrorToClientResponse(
          error,
          correlationId,
          errorResponseFormat
        );

        res
          .status(mappedError.statusCode)
          .set(mappedError.headers)
          .json(mappedError.body);
      } finally {
        req.off('close', abortRequest);
        req.off('aborted', abortRequest);
      }
    }
  );
};

/**
 * Make AWS Bedrock API request with circuit breaker and retry logic
 */
async function makeBedrockAPIRequestWithResilience(
  client: AWSBedrockClient,
  params: import('../types/index.js').ResponsesCreateParams,
  correlationId: string,
  signal?: AbortSignal
): Promise<ResponsesResponse> {
  throwIfAborted(signal, 'Bedrock request aborted before execution');

  // Get circuit breaker for AWS Bedrock
  const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(
    'aws-bedrock-api',
    {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'AZURE_OPENAI_ERROR'],
    }
  );

  // Get retry strategy
  const retryStrategy = retryStrategyRegistry.getStrategy('aws-bedrock-api', {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    timeoutMs: bedrockConfiguration?.timeout ?? 120000,
  });

  // Execute with circuit breaker protection
  const circuitResult = await circuitBreaker.execute(
    async () => {
      throwIfAborted(signal, 'Bedrock request aborted before retry');
      // Execute with retry logic
      const retryResult = await retryStrategy.execute(
        async () => {
          throwIfAborted(signal, 'Bedrock request aborted before call');
          try {
            logger.debug('Making AWS Bedrock API request', correlationId, {
              model: params.model,
              hasReasoning: Boolean(params.reasoning),
              reasoningEffort: params.reasoning?.effort,
              inputType: typeof params.input,
              inputLength: Array.isArray(params.input)
                ? params.input.length
                : typeof params.input === 'string'
                  ? params.input.length
                  : 0,
            });

            const response = await client.createResponse(params, signal);

            logger.debug('AWS Bedrock API request successful', correlationId, {
              responseId: response.id,
              outputCount: response.output.length,
              totalTokens: response.usage.total_tokens,
            });

            return response;
          } catch (error) {
            // Re-throw our custom errors as-is
            if (
              error instanceof ValidationError ||
              error instanceof AzureOpenAIError
            ) {
              throw error;
            }

            // Convert other errors to our custom error types
            if (error instanceof Error) {
              if (error.message.includes('timeout')) {
                throw ErrorFactory.fromTimeout(
                  bedrockConfiguration?.timeout ?? 120000,
                  correlationId,
                  'aws-bedrock-api-request'
                );
              }

              if (
                error.message.includes('network') ||
                error.message.includes('ECONNREFUSED')
              ) {
                throw ErrorFactory.fromNetworkError(
                  error,
                  correlationId,
                  'aws-bedrock-api-request'
                );
              }
            }

            throw error;
          }
        },
        correlationId,
        'aws-bedrock-api-request',
        signal
      );

      if (retryResult.success && retryResult.data !== undefined) {
        return retryResult.data;
      }

      const retryFailureError =
        retryResult.error ??
        new Error('Request failed after all retry attempts');
      throw retryFailureError;
    },
    correlationId,
    'aws-bedrock-api-request'
  );

  if (circuitResult.success && circuitResult.data !== undefined) {
    return circuitResult.data;
  }

  const circuitFailureError =
    circuitResult.error ??
    new Error('Circuit breaker prevented request execution');
  throw circuitFailureError;
}

async function handleBedrockRequest(
  client: AWSBedrockClient,
  processingResult: import('../utils/universal-request-processor.js').UniversalProcessingResult,
  conversationId: string,
  responseFormat: ResponseFormat,
  correlationId: string,
  req: RequestWithCorrelationId,
  res: Response,
  metrics: RequestMetrics,
  routingDecision: ModelRoutingDecision,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);

  const { responsesParams, reasoningEffort } = processingResult;

  // Track Bedrock request start (Requirement 4.1)
  const healthMonitor = getHealthMonitor();
  const bedrockMonitor = healthMonitor.getBedrockMonitor();
  const requestType =
    responsesParams.stream === true ? 'streaming' : 'non-streaming';

  if (bedrockMonitor) {
    bedrockMonitor.trackBedrockRequest(
      correlationId,
      routingDecision.requestedModel,
      requestType
    );
  }

  logger.debug('Starting Bedrock request handling', correlationId, {
    conversationId,
    provider: routingDecision.provider,
    model: routingDecision.requestedModel,
    backendModel: routingDecision.backendModel,
    streaming: responsesParams.stream === true,
    reasoningEffort,
  });

  // Check if streaming is requested by client
  const isStreamingRequest = responsesParams.stream === true;

  // Prepare Bedrock parameters with correct model mapping
  const bedrockParams = {
    ...responsesParams,
    model: routingDecision.backendModel, // Use the mapped backend model ID
    stream: false, // Force non-streaming for now, simulate streaming if needed
  };

  if (isStreamingRequest) {
    // Handle client streaming request with simulated streaming
    await handleBedrockSimulatedStreamingRequest(
      client,
      {
        ...processingResult,
        responsesParams: bedrockParams,
        reasoningEffort,
      },
      conversationId,
      responseFormat,
      correlationId,
      req,
      res,
      metrics,
      signal
    );
    return;
  }

  // Make non-streaming request to AWS Bedrock with circuit breaker and retry logic
  let bedrockAPIResponse: ResponsesResponse;
  const bedrockRequestStart = Date.now();
  const cleanupAbortListener = endResponseOnAbort(res, signal);

  try {
    bedrockAPIResponse = await makeBedrockAPIRequestWithResilience(
      client,
      bedrockParams,
      correlationId,
      signal
    );

    metrics.bedrockRequestTime = Date.now() - bedrockRequestStart;

    logger.debug('AWS Bedrock API request completed', correlationId, {
      responseId: bedrockAPIResponse.id,
      bedrockRequestTime: metrics.bedrockRequestTime,
      outputCount: bedrockAPIResponse.output.length,
      totalTokens: bedrockAPIResponse.usage.total_tokens,
    });

    // Track conversation for continuity
    conversationManager.trackConversation(
      conversationId,
      bedrockAPIResponse.id,
      {
        totalTokensUsed: bedrockAPIResponse.usage.total_tokens,
        reasoningTokensUsed: bedrockAPIResponse.usage.reasoning_tokens ?? 0,
        averageResponseTime: metrics.bedrockRequestTime,
        errorCount: 0,
      }
    );
  } catch (error) {
    metrics.bedrockRequestTime = Date.now() - bedrockRequestStart;

    if (isAbortError(error) || signal.aborted) {
      if (bedrockMonitor) {
        bedrockMonitor.completeBedrockRequest(correlationId, false, 'AbortError');
      }

      logger.info('Bedrock request aborted by client', correlationId, {
        bedrockRequestTime: metrics.bedrockRequestTime,
      });
      return;
    }

    // Track Bedrock request error (Requirement 4.2)
    if (bedrockMonitor) {
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      bedrockMonitor.completeBedrockRequest(correlationId, false, errorType);
    }

    // Update conversation with error
    conversationManager.updateConversationMetrics(conversationId, {
      errorCount: 1,
    });

    // Try graceful degradation for Bedrock API failures
    const axiosStatus =
      typeof (error as { response?: { status?: number } }).response?.status ===
      'number'
        ? (error as { response: { status: number } }).response.status
        : undefined;

    const derivedStatus =
      error instanceof AzureOpenAIError
        ? error.statusCode
        : error instanceof ValidationError
          ? 400
          : axiosStatus;

    const shouldAttemptDegradation =
      derivedStatus === undefined || derivedStatus >= 500;

    if (shouldAttemptDegradation) {
      try {
        const degradationResult =
          await gracefulDegradationManager.executeGracefulDegradation({
            correlationId,
            operation: 'bedrock-api-completions',
            error: error as Error,
            attempt: 1,
            metadata: { bedrockRequestTime: metrics.bedrockRequestTime },
          });

        if (degradationResult.success) {
          logger.info(
            'Graceful degradation successful for Bedrock',
            correlationId,
            {
              fallback: degradationResult.fallbackUsed,
              degraded: degradationResult.degraded,
            }
          );

          const fallbackResult = buildFallbackResponse(
            degradationResult.data,
            responseFormat,
            correlationId
          );

          res
            .status(fallbackResult.statusCode)
            .set(fallbackResult.headers)
            .json(fallbackResult.body);
          return;
        }
      } catch (degradationError) {
        logger.warn(
          'Graceful degradation exception for Bedrock',
          correlationId,
          {
            originalError:
              error instanceof Error ? error.message : 'Unknown error',
            degradationError:
              degradationError instanceof Error
                ? degradationError.message
                : 'Unknown error',
          }
        );
      }
    }

    // Handle specific error types
    if (error instanceof ValidationError) {
      const errorResponse = createErrorResponseByFormat(
        'invalid_request_error',
        error.message,
        400,
        correlationId,
        responseFormat
      );

      res
        .status(errorResponse.statusCode)
        .set(errorResponse.headers)
        .json(errorResponse.response);
      return;
    }

    if (error instanceof AzureOpenAIError) {
      let errorType:
        | 'invalid_request_error'
        | 'authentication_error'
        | 'rate_limit_error'
        | 'api_error' = 'api_error';

      if (error.azureErrorType === 'invalid_request_error') {
        errorType = 'invalid_request_error';
      } else if (error.azureErrorType === 'authentication_error') {
        errorType = 'authentication_error';
      } else if (error.azureErrorType === 'rate_limit_error') {
        errorType = 'rate_limit_error';
      }

      const errorResponse = createErrorResponseByFormat(
        errorType,
        error.message,
        error.statusCode,
        correlationId,
        responseFormat
      );

      res
        .status(errorResponse.statusCode)
        .set(errorResponse.headers)
        .json(errorResponse.response);
      return;
    }

    const mappedError = mapErrorToClientResponse(
      error,
      correlationId,
      responseFormat
    );

    res
      .status(mappedError.statusCode)
      .set(mappedError.headers)
      .json(mappedError.body);
    return;
  } finally {
    cleanupAbortListener();
  }

  // Transform Bedrock API response to appropriate format
  const responseTransformStart = Date.now();
  let responseTransformationResult;

  try {
    const normalizedResponse: ResponsesResponse = {
      ...bedrockAPIResponse,
      model: routingDecision.requestedModel, // Return the user's requested model name
    };

    responseTransformationResult = buildSuccessResponse(
      normalizedResponse,
      responseFormat,
      correlationId
    );

    metrics.responseTransformationTime = Date.now() - responseTransformStart;

    logger.debug('Bedrock response transformation successful', correlationId, {
      responseTransformationTime: metrics.responseTransformationTime,
      responseFormat,
      outputCount: bedrockAPIResponse.output.length,
    });
  } catch (error) {
    metrics.responseTransformationTime = Date.now() - responseTransformStart;

    logger.error('Bedrock response transformation failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTransformationTime: metrics.responseTransformationTime,
    });

    // Create fallback error response
    const errorResponse = createErrorResponseByFormat(
      'api_error',
      'Failed to transform Bedrock response',
      500,
      correlationId,
      responseFormat
    );

    res
      .status(errorResponse.statusCode)
      .set(errorResponse.headers)
      .json(errorResponse.response);
    return;
  }

  // Calculate total processing time
  metrics.totalTime = Date.now() - metrics.startTime;

  // Performance monitoring and logging
  logger.info('Bedrock completions request completed', correlationId, {
    statusCode: responseTransformationResult.statusCode,
    totalTime: metrics.totalTime,
    requestSize: metrics.requestSize,
    formatDetectionTime: metrics.formatDetectionTime,
    transformationTime: metrics.transformationTime,
    bedrockRequestTime: metrics.bedrockRequestTime,
    responseTransformationTime: metrics.responseTransformationTime,
    responseSize: JSON.stringify(responseTransformationResult.body).length,
    responseFormat,
    conversationId,
    reasoningEffort,
    estimatedComplexity: processingResult.estimatedComplexity,
    totalTokens: bedrockAPIResponse.usage.total_tokens,
    provider: 'bedrock',
    requestedModel: routingDecision.requestedModel,
    backendModel: routingDecision.backendModel,
  });

  // Performance warning for slow requests
  const timeoutMs = bedrockConfiguration?.timeout ?? 120000;
  if (metrics.totalTime > timeoutMs * 0.25) {
    // 25% of configured timeout
    logger.warn('Slow Bedrock completion request detected', correlationId, {
      totalTime: metrics.totalTime,
      breakdown: {
        formatDetection: metrics.formatDetectionTime,
        transformation: metrics.transformationTime,
        bedrockRequest: metrics.bedrockRequestTime,
        responseTransformation: metrics.responseTransformationTime,
      },
      conversationId,
      reasoningEffort,
    });
  }

  // Track Bedrock request completion (Requirement 4.2)
  if (bedrockMonitor) {
    bedrockMonitor.completeBedrockRequest(correlationId, true);
  }

  // Send response with proper headers
  res
    .status(responseTransformationResult.statusCode)
    .set(responseTransformationResult.headers)
    .json(responseTransformationResult.body);
}

/**
 * Handle simulated streaming requests using non-streaming Bedrock backend
 * This function makes a non-streaming request to Bedrock but simulates streaming for the client
 */
async function handleBedrockSimulatedStreamingRequest(
  client: AWSBedrockClient,
  processingResult: import('../utils/universal-request-processor.js').UniversalProcessingResult,
  conversationId: string,
  responseFormat: import('../types/index.js').ResponseFormat,
  correlationId: string,
  req: RequestWithCorrelationId,
  res: Response,
  metrics: RequestMetrics,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal, 'Bedrock simulated streaming aborted before start');

  const bedrockRequestStart = Date.now();

  const cleanupAbortListener = endResponseOnAbort(res, signal);

  // Track Bedrock streaming request start (Requirement 4.1)
  const healthMonitor = getHealthMonitor();
  const bedrockMonitor = healthMonitor.getBedrockMonitor();

  if (bedrockMonitor) {
    bedrockMonitor.trackBedrockRequest(
      correlationId,
      processingResult.responsesParams.model,
      'streaming'
    );
  }

  try {
    logger.debug(
      'Starting Bedrock simulated streaming request',
      correlationId,
      {
        conversationId,
        responseFormat,
        reasoningEffort: processingResult.reasoningEffort,
      }
    );

    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    throwIfAborted(signal, 'Bedrock simulated streaming aborted before request');

    // Make non-streaming request to Bedrock
    const bedrockAPIResponse = await makeBedrockAPIRequestWithResilience(
      client,
      processingResult.responsesParams,
      correlationId,
      signal
    );

    metrics.bedrockRequestTime = Date.now() - bedrockRequestStart;

    // Simulate streaming by breaking the response into chunks
    await simulateStreamingResponse(
      bedrockAPIResponse,
      responseFormat,
      correlationId,
      res,
      signal
    );

    // Track conversation for continuity
    conversationManager.trackConversation(
      conversationId,
      bedrockAPIResponse.id,
      {
        totalTokensUsed: bedrockAPIResponse.usage.total_tokens,
        reasoningTokensUsed: bedrockAPIResponse.usage.reasoning_tokens,
        averageResponseTime: metrics.bedrockRequestTime,
        errorCount: 0,
      }
    );

    metrics.totalTime = Date.now() - metrics.startTime;

    // Track Bedrock streaming request completion (Requirement 4.2)
    if (bedrockMonitor) {
      bedrockMonitor.completeBedrockRequest(correlationId, true);
    }

    logger.info(
      'Bedrock simulated streaming request completed',
      correlationId,
      {
        totalTime: metrics.totalTime,
        bedrockRequestTime: metrics.bedrockRequestTime,
        chunkCount: 'simulated',
        totalTokens: bedrockAPIResponse.usage.total_tokens,
        conversationId,
        responseFormat,
        provider: 'bedrock',
      }
    );
  } catch (error) {
    metrics.totalTime = Date.now() - metrics.startTime;
    metrics.bedrockRequestTime = Date.now() - bedrockRequestStart;

    if (isAbortError(error) || signal.aborted) {
      if (bedrockMonitor) {
        bedrockMonitor.completeBedrockRequest(correlationId, false, 'AbortError');
      }

      logger.info('Bedrock simulated streaming aborted by client', correlationId, {
        totalTime: metrics.totalTime,
        bedrockRequestTime: metrics.bedrockRequestTime,
      });
      return;
    }

    // Track Bedrock streaming request error (Requirement 4.2)
    if (bedrockMonitor) {
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      bedrockMonitor.completeBedrockRequest(correlationId, false, errorType);
    }

    logger.error('Bedrock simulated streaming request failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime: metrics.totalTime,
      bedrockRequestTime: metrics.bedrockRequestTime,
    });

    // Update conversation with error
    conversationManager.updateConversationMetrics(conversationId, {
      errorCount: 1,
    });

    // Send error event and close stream
    if (responseFormat === 'claude') {
      res.write('event: error\n');
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        })}\n\n`
      );
      res.write('event: message_stop\n');
      res.write('data: {"type":"message_stop"}\n\n');
    } else {
      res.write(
        `data: ${JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
          },
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
    }

    res.end();
  } finally {
    cleanupAbortListener();
  }
}

/**
 * Handle simulated streaming requests using non-streaming Azure backend
 * This function makes a non-streaming request to Azure but simulates streaming for the client
 */
async function handleSimulatedStreamingRequest(
  client: AzureResponsesClient,
  processingResult: import('../utils/universal-request-processor.js').UniversalProcessingResult,
  conversationId: string,
  responseFormat: import('../types/index.js').ResponseFormat,
  correlationId: string,
  req: RequestWithCorrelationId,
  res: Response,
  metrics: RequestMetrics,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal, 'Simulated streaming aborted before start');

  const azureRequestStart = Date.now();
  const cleanupAbortListener = endResponseOnAbort(res, signal);

  try {
    logger.debug('Starting simulated streaming request', correlationId, {
      conversationId,
      responseFormat,
      reasoningEffort: processingResult.reasoningEffort,
    });

    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    throwIfAborted(signal, 'Simulated streaming aborted before Azure request');

    // Make non-streaming request to Azure
    const responsesAPIResponse = await makeResponsesAPIRequestWithResilience(
      client,
      processingResult.responsesParams,
      correlationId,
      signal
    );

    metrics.azureRequestTime = Date.now() - azureRequestStart;

    // Simulate streaming by breaking the response into chunks
    await simulateStreamingResponse(
      responsesAPIResponse,
      responseFormat,
      correlationId,
      res,
      signal
    );

    // Track conversation for continuity
    conversationManager.trackConversation(
      conversationId,
      responsesAPIResponse.id,
      {
        totalTokensUsed: responsesAPIResponse.usage.total_tokens,
        reasoningTokensUsed: responsesAPIResponse.usage.reasoning_tokens,
        averageResponseTime: metrics.azureRequestTime,
        errorCount: 0,
      }
    );

    metrics.totalTime = Date.now() - metrics.startTime;

    logger.info('Simulated streaming request completed', correlationId, {
      totalTime: metrics.totalTime,
      azureRequestTime: metrics.azureRequestTime,
      chunkCount: 'simulated',
      totalTokens: responsesAPIResponse.usage.total_tokens,
      reasoningTokens: responsesAPIResponse.usage.reasoning_tokens,
      conversationId,
      responseFormat,
    });
  } catch (error) {
    metrics.totalTime = Date.now() - metrics.startTime;
    metrics.azureRequestTime = Date.now() - azureRequestStart;

    if (isAbortError(error) || signal.aborted) {
      logger.info('Simulated streaming aborted by client', correlationId, {
        totalTime: metrics.totalTime,
        azureRequestTime: metrics.azureRequestTime,
      });
      return;
    }

    logger.error('Simulated streaming request failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime: metrics.totalTime,
      azureRequestTime: metrics.azureRequestTime,
    });

    // Update conversation with error
    conversationManager.updateConversationMetrics(conversationId, {
      errorCount: 1,
    });

    // Send error event and close stream
    if (responseFormat === 'claude') {
      res.write('event: error\n');
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        })}\n\n`
      );
      res.write('event: message_stop\n');
      res.write('data: {"type":"message_stop"}\n\n');
    } else {
      res.write(
        `data: ${JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
          },
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
    }

    res.end();
  } finally {
    cleanupAbortListener();
  }
}

/**
 * Simulate streaming response by breaking non-streaming response into chunks
 */
async function simulateStreamingResponse(
  response: import('../types/index.js').ResponsesResponse,
  responseFormat: import('../types/index.js').ResponseFormat,
  correlationId: string,
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  if (res.writableEnded) {
    return;
  }

  const writer = createAbortableStreamWriter(res, signal);
  const simulationOptions = {
    closedMessage: 'Response stream closed during simulation',
  } as const;

  if (responseFormat === 'claude') {
    writer.write('event: message_start\n');
    writer.write(
      `data: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: response.id,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: {
            input_tokens: response.usage.prompt_tokens,
            output_tokens: 0,
          },
        },
      })}\n\n`
    );

    const textContent = extractTextFromResponseOutput(response.output);

    if (textContent && textContent.length > 0) {
      writer.write('event: content_block_start\n');
      writer.write(
        `data: ${JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        })}\n\n`
      );

      const chunkSize = Math.max(1, Math.floor(textContent.length / 5));
      for (let i = 0; i < textContent.length; i += chunkSize) {
        const chunk = textContent.slice(i, i + chunkSize);

        writer.write('event: content_block_delta\n', simulationOptions);
        writer.write(
          `data: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: chunk,
            },
          })}\n\n`,
          simulationOptions
        );

        await abortableDelay(50, signal, 'Simulated streaming delay aborted');
        writer.ensureWritable(simulationOptions);
      }

      writer.write('event: content_block_stop\n');
      writer.write(
        `data: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0,
        })}\n\n`
      );
    }

    writer.write('event: message_stop\n');
    writer.write(
      `data: ${JSON.stringify({
        type: 'message_stop',
        usage: {
          input_tokens: response.usage.prompt_tokens,
          output_tokens: response.usage.completion_tokens,
        },
      })}\n\n`
    );
  } else {
    writer.write(
      `data: ${JSON.stringify({
        id: response.id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-5-codex',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );

    const textContent = extractTextFromResponseOutput(response.output);

    if (textContent && textContent.length > 0) {
      const chunkSize = Math.max(1, Math.floor(textContent.length / 5));
      for (let i = 0; i < textContent.length; i += chunkSize) {
        const chunk = textContent.slice(i, i + chunkSize);

        writer.write(
          `data: ${JSON.stringify({
            id: response.id,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'gpt-5-codex',
            choices: [
              {
                index: 0,
                delta: {
                  content: chunk,
                },
                finish_reason: null,
              },
            ],
          })}\n\n`,
          simulationOptions
        );

        await abortableDelay(50, signal, 'Simulated streaming delay aborted');
        writer.ensureWritable(simulationOptions);
      }
    }

    writer.write(
      `data: ${JSON.stringify({
        id: response.id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-5-codex',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        },
      })}\n\n`
    );

    writer.write('data: [DONE]\n\n');
  }

  writer.end();
}

/**
 * Extract text content from response output array
 */
function extractTextFromResponseOutput(
  output: readonly import('../types/index.js').ResponseOutput[]
): string {
  for (const outputItem of output) {
    if (outputItem.type === 'text' && outputItem.text !== undefined) {
      return outputItem.text;
    }
  }
  return '';
}

/**
 * Combined completions middleware with rate limiting and authentication
 * Rate limiting is applied before the main handler to prevent resource exhaustion
 */
export const secureCompletionsHandler = (config: Readonly<ServerConfig>) => [
  completionsRateLimit,
  completionsHandler(config),
];
/*
// TEMPORARILY DISABLED: handleStreamingRequest function
// This function was disabled due to issues with Azure OpenAI streaming API
// It may be re-enabled in the future after fixing the underlying issues
// The function has been replaced with handleSimulatedStreamingRequest which provides
// streaming-like behavior using non-streaming Azure API calls

// Original function signature:
// async function handleStreamingRequest(
//   req: RequestWithCorrelationId,
//   client: AzureResponsesClient,
//   processingResult: UniversalProcessingResult,
//   responsesParams: ResponsesCreateParams,
//   conversationId: string,
//   responseFormat: 'claude' | 'openai',
//   correlationId: string, 
//   res: Response
// ): Promise<void>
*/
