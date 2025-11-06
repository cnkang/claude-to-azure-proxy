/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * Requirements: 6.3, 7.3
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { frontendLogger } from '../../utils/logger';

interface ErrorBoundaryFallbackParams {
  error: Error;
  _errorInfo: ErrorInfo | null;
  resetError: () => void;
  eventId: string | null;
}

type ErrorBoundaryFallbackRender = (params: ErrorBoundaryFallbackParams) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: ErrorBoundaryFallbackRender;
  onError?: (_error: Error, _errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  _errorInfo: ErrorInfo | null;
  eventId: string | null;
}

/**
 * Error Boundary class component
 */
class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      _errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      eventId: crypto.randomUUID(),
    };
  }

  override componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    // Log error to monitoring service
    frontendLogger.error('React error boundary caught error', {
      error,
      metadata: {
        componentStack: _errorInfo.componentStack,
        errorBoundary: this.constructor.name,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
    });

    // Update state with error info
    this.setState({
      _errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, _errorInfo);

    // Auto-reset after 10 seconds in development
    if (import.meta.env.DEV) {
      this.resetTimeoutId = window.setTimeout(() => {
        this.resetErrorBoundary();
      }, 10000);
    }
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (hasError && resetOnPropsChange && resetKeys) {
      const prevResetKeys = prevProps.resetKeys ?? [];
      const hasResetKeyChanged = resetKeys.some(
        (resetKey, idx) => prevResetKeys[idx] !== resetKey
      );

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  override componentWillUnmount(): void {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = (): void => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    this.setState({
      hasError: false,
      error: null,
      _errorInfo: null,
      eventId: null,
    });
  };

  override render(): ReactNode {
    const { hasError, error, _errorInfo, eventId } = this.state;
    const { children, fallback, fallbackRender } = this.props;

    if (hasError) {
      if (fallbackRender) {
        return fallbackRender({
          error: error ?? new Error('Unknown error'),
          _errorInfo,
          resetError: this.resetErrorBoundary,
          eventId,
        });
      }

      // Custom fallback UI
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <ErrorFallback
          error={error}
          _errorInfo={_errorInfo}
          eventId={eventId}
          onReset={this.resetErrorBoundary}
        />
      );
    }

    return children;
  }
}

/**
 * Default error fallback component
 */
interface ErrorFallbackProps {
  error: Error | null;
  _errorInfo: ErrorInfo | null;
  eventId: string | null;
  onReset: () => void;
}

function ErrorFallback({ error, _errorInfo, eventId, onReset }: ErrorFallbackProps): React.JSX.Element {
  const { t } = useTranslation();

  const handleReloadPage = (): void => {
    window.location.reload();
  };

  const handleCopyError = async (): Promise<void> => {
    if (!error) {return;}

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: _errorInfo?.componentStack,
      eventId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(errorDetails, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div
      role="alert"
      className="error-boundary"
      style={{
        padding: '2rem',
        margin: '1rem',
        border: '1px solid #ef4444',
        borderRadius: '0.5rem',
        backgroundColor: '#fef2f2',
        color: '#991b1b',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
        {t('error.boundary.title')}
      </h2>
      
      <p style={{ marginBottom: '1.5rem', color: '#7f1d1d' }}>
        {t('error.boundary.message')}
      </p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onReset}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          {t('error.boundary.tryAgain')}
        </button>

        <button
          onClick={handleReloadPage}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          {t('error.boundary.reloadPage')}
        </button>

        {import.meta.env.DEV && error && (
          <button
            onClick={handleCopyError}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Copy Error Details
          </button>
        )}
      </div>

      {import.meta.env.DEV && error && (
        <details style={{ marginTop: '1.5rem', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {t('error.boundary.details')}
          </summary>
          <pre
            style={{
              backgroundColor: '#f3f4f6',
              padding: '1rem',
              borderRadius: '0.25rem',
              overflow: 'auto',
              fontSize: '0.75rem',
              color: '#374151',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.stack}
          </pre>
          {_errorInfo?.componentStack && (
            <pre
              style={{
                backgroundColor: '#f3f4f6',
                padding: '1rem',
                borderRadius: '0.25rem',
                overflow: 'auto',
                fontSize: '0.75rem',
                color: '#374151',
                whiteSpace: 'pre-wrap',
                marginTop: '0.5rem',
              }}
            >
              {_errorInfo.componentStack}
            </pre>
          )}
        </details>
      )}

      {eventId && (
        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Error ID: {eventId}
        </p>
      )}
    </div>
  );
}

/**
 * Error Boundary wrapper component with hooks support
 */
export function ErrorBoundary(props: ErrorBoundaryProps): React.JSX.Element {
  return <ErrorBoundaryClass {...props} />;
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for manually triggering error boundary
 */
export function useErrorHandler() {
  return (error: Error, errorInfo?: ErrorInfo) => {
    // Log error
    frontendLogger.error('Manual error trigger', {
      error,
      metadata: {
        ...errorInfo,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
    });

    // Re-throw to trigger error boundary
    throw error;
  };
}

export default ErrorBoundary;
