/**
 * Error Handling Hook
 *
 * Provides centralized error handling with notifications, logging,
 * and recovery mechanisms for React components.
 *
 * Requirements: 6.3, 7.3
 */

import { useCallback, useRef } from 'react';
import type { ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NetworkError,
  networkErrorHandler,
} from '../utils/networkErrorHandler.js';
import { useNotifications } from '../components/common/NotificationSystem.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Error handling options
 */
interface ErrorHandlingOptions {
  showNotification?: boolean;
  logError?: boolean;
  retryable?: boolean;
  onRetry?: () => void | Promise<void>;
  fallbackMessage?: string;
  context?: string;
}

/**
 * Error recovery function type
 */
type ErrorRecoveryFn = () => void | Promise<void>;

/**
 * Error handling hook
 */
export function useErrorHandling() {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const retryFunctionsRef = useRef<Map<string, ErrorRecoveryFn>>(new Map());

  /**
   * Handle error with comprehensive error processing
   */
  const handleError = useCallback(
    (error: unknown, options: ErrorHandlingOptions = {}): NetworkError => {
      const {
        showNotification = true,
        logError = true,
        retryable = false,
        onRetry,
        fallbackMessage,
        context = 'unknown',
      } = options;

      // Classify the error
      let networkError: NetworkError;
      if (error instanceof NetworkError) {
        networkError = error;
      } else if (error instanceof Error) {
        networkError = networkErrorHandler.classifyError(error);
      } else {
        networkError = new NetworkError(
          fallbackMessage ?? t('error.general.message'),
          'unknown',
          {
            originalError:
              error instanceof Error ? error : new Error(String(error)),
          }
        );
      }

      // Log the error
      if (logError) {
        frontendLogger.error(`Error in ${context}`, {
          error: networkError,
          metadata: {
            context,
            errorType: networkError.type,
            retryable: networkError.retryable,
            correlationId: networkError.correlationId,
            timestamp: networkError.timestamp.toISOString(),
          },
        });
      }

      // Show notification
      if (showNotification) {
        const actions = [];

        // Add retry action if retryable
        if ((retryable || networkError.retryable) && onRetry) {
          const retryId = crypto.randomUUID();
          retryFunctionsRef.current.set(retryId, onRetry);

          actions.push({
            label: t('common.retry'),
            action: () => {
              const retryFn = retryFunctionsRef.current.get(retryId);
              if (retryFn) {
                retryFn();
                retryFunctionsRef.current.delete(retryId);
              }
            },
            primary: true,
          });
        }

        showError(networkError, {
          actions: actions.length > 0 ? actions : undefined,
          metadata: {
            context,
            correlationId: networkError.correlationId,
          },
        });
      }

      return networkError;
    },
    [t, showError]
  );

  /**
   * Handle async operation with error handling
   */
  const handleAsyncOperation = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options: ErrorHandlingOptions & {
        loadingMessage?: string;
        successMessage?: string;
      } = {}
    ): Promise<T | null> => {
      const {
        loadingMessage,
        successMessage,
        context = 'async operation',
        ...errorOptions
      } = options;

      try {
        const result = await operation();

        if (successMessage) {
          // Could show success notification here if needed
        }

        return result;
      } catch (error) {
        handleError(error, {
          ...errorOptions,
          context,
          onRetry: errorOptions.onRetry
            ? async () => {
                await handleAsyncOperation(operation, options);
              }
            : undefined,
        });

        return null;
      }
    },
    [handleError]
  );

  /**
   * Create error boundary handler
   */
  const createErrorBoundaryHandler = useCallback(
    (context: string) => {
      return (boundaryError: Error, _errorInfo: ErrorInfo) => {
        handleError(boundaryError, {
          context: `Error Boundary: ${context}`,
          showNotification: true,
          logError: true,
          retryable: false,
        });
      };
    },
    [handleError]
  );

  /**
   * Handle network errors specifically
   */
  const handleNetworkError = useCallback(
    (
      error: NetworkError,
      options: Omit<ErrorHandlingOptions, 'retryable'> & {
        autoRetry?: boolean;
        maxRetries?: number;
      } = {}
    ) => {
      const { autoRetry = false, maxRetries = 3, ...errorOptions } = options;

      // Auto-retry for retryable network errors
      if (autoRetry && error.retryable && options.onRetry) {
        let retryCount = 0;

        const retryWithBackoff = async () => {
          if (retryCount >= maxRetries) {
            handleError(error, {
              ...errorOptions,
              retryable: false,
              fallbackMessage: t('error.network.maxRetriesReached'),
            });
            return;
          }

          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);

          setTimeout(async () => {
            try {
              await options.onRetry?.();
            } catch (retryError) {
              if (retryError instanceof NetworkError && retryError.retryable) {
                retryWithBackoff();
              } else {
                handleError(retryError, errorOptions);
              }
            }
          }, delay);
        };

        retryWithBackoff();
      } else {
        handleError(error, {
          ...errorOptions,
          retryable: error.retryable,
        });
      }
    },
    [handleError, t]
  );

  /**
   * Handle validation errors
   */
  const handleValidationError = useCallback(
    (
      errors: Record<string, string[]> | string[],
      options: Omit<ErrorHandlingOptions, 'retryable'> = {}
    ) => {
      let message: string;

      if (Array.isArray(errors)) {
        message = errors.join(', ');
      } else {
        const allErrors = Object.values(errors).flat();
        message = allErrors.join(', ');
      }

      const validationError = new NetworkError(message, 'validation_error', {
        retryable: false,
      });

      handleError(validationError, {
        ...options,
        retryable: false,
      });

      return validationError;
    },
    [handleError]
  );

  /**
   * Create retry function for components
   */
  const createRetryFunction = useCallback(
    (operation: () => void | Promise<void>, context: string) => {
      return async () => {
        try {
          await operation();
        } catch (error) {
          handleError(error, {
            context: `Retry: ${context}`,
            retryable: true,
            onRetry: () => createRetryFunction(operation, context)(),
          });
        }
      };
    },
    [handleError]
  );

  /**
   * Handle SSE connection errors
   */
  const handleSSEError = useCallback(
    (
      error: NetworkError,
      connectionState: string,
      onReconnect?: () => void
    ) => {
      const isRetryable = error.retryable && connectionState !== 'disconnected';

      handleError(error, {
        context: 'SSE Connection',
        retryable: isRetryable,
        onRetry: onReconnect,
        showNotification: connectionState === 'error', // Only show for persistent errors
      });
    },
    [handleError]
  );

  /**
   * Clear retry functions (cleanup)
   */
  const clearRetryFunctions = useCallback(() => {
    retryFunctionsRef.current.clear();
  }, []);

  return {
    handleError,
    handleAsyncOperation,
    handleNetworkError,
    handleValidationError,
    handleSSEError,
    createErrorBoundaryHandler,
    createRetryFunction,
    clearRetryFunctions,
  };
}

/**
 * Hook for handling specific error types
 */
export function useSpecificErrorHandling() {
  const { handleError } = useErrorHandling();
  const { t } = useTranslation();

  const handleAuthError = useCallback(
    (caughtError: unknown) => {
      return handleError(caughtError, {
        context: 'Authentication',
        fallbackMessage: t('error.network.unauthorized'),
        retryable: false,
      });
    },
    [handleError, t]
  );

  const handleUploadError = useCallback(
    (caughtError: unknown, fileName?: string) => {
      return handleError(caughtError, {
        context: `File Upload${fileName ? `: ${fileName}` : ''}`,
        fallbackMessage: t('fileUpload.uploadError'),
        retryable: true,
      });
    },
    [handleError, t]
  );

  const handleChatError = useCallback(
    (caughtError: unknown, onRetry?: () => void) => {
      return handleError(caughtError, {
        context: 'Chat Message',
        fallbackMessage: t('chat.sendError'),
        retryable: true,
        onRetry,
      });
    },
    [handleError, t]
  );

  return {
    handleAuthError,
    handleUploadError,
    handleChatError,
  };
}

export default useErrorHandling;
