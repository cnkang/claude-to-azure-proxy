/**
 * Lazy Component Wrapper
 *
 * Higher-order component for lazy loading components with loading states
 * and error boundaries. Implements React code splitting patterns.
 *
 * Requirements: 5.4
 */

import React, { Suspense, ComponentType, LazyExoticComponent } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useI18n } from '../../contexts/I18nContext';

/**
 * Loading component for lazy-loaded components
 */
interface LazyLoadingProps {
  message?: string;
  className?: string;
}

function LazyLoading({
  message,
  className = '',
}: LazyLoadingProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className={`lazy-loading ${className}`}>
      <div className="lazy-loading-content">
        <div className="lazy-loading-spinner">
          <div className="spinner" />
        </div>
        <p className="lazy-loading-text">{message || t('common.loading')}</p>
      </div>
    </div>
  );
}

/**
 * Error fallback for lazy-loaded components
 */
interface LazyErrorFallbackProps {
  error: Error;
  retry: () => void;
  className?: string;
}

function LazyErrorFallback({
  error,
  retry,
  className = '',
}: LazyErrorFallbackProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className={`lazy-error ${className}`}>
      <div className="lazy-error-content">
        <div className="lazy-error-icon">⚠️</div>
        <h3 className="lazy-error-title">{t('error.lazyLoadFailed')}</h3>
        <p className="lazy-error-message">
          {error.message || t('error.componentLoadError')}
        </p>
        <button type="button" onClick={retry} className="lazy-error-retry">
          {t('common.retry')}
        </button>
      </div>
    </div>
  );
}

/**
 * Options for lazy component wrapper
 */
interface LazyComponentOptions {
  loadingMessage?: string;
  errorMessage?: string;
  className?: string;
  retryable?: boolean;
}

/**
 * Higher-order component for lazy loading with error handling
 */
export function withLazyLoading<P extends object>(
  LazyComponent: LazyExoticComponent<ComponentType<P>>,
  options: LazyComponentOptions = {}
): ComponentType<P> {
  const {
    loadingMessage,
    errorMessage: _errorMessage,
    className = '',
    retryable = true,
  } = options;

  return function LazyWrapper(props: P): React.JSX.Element {
    const [retryKey, setRetryKey] = React.useState(0);

    const handleRetry = React.useCallback(() => {
      setRetryKey((prev) => prev + 1);
    }, []);

    return (
      <ErrorBoundary
        key={retryKey}
        fallbackRender={({ error, resetError }) => (
          <LazyErrorFallback
            error={error}
            retry={
              retryable
                ? () => {
                    resetError();
                    handleRetry();
                  }
                : resetError
            }
            className={className}
          />
        )}
        resetOnPropsChange={true}
      >
        <Suspense
          fallback={
            <LazyLoading message={loadingMessage} className={className} />
          }
        >
          <LazyComponent {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

/**
 * Hook for dynamic imports with loading states
 */
export function useDynamicImport<T>(
  importFn: () => Promise<{ default: T }>,
  deps: React.DependencyList = []
): {
  component: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
} {
  const [state, setState] = React.useState<{
    component: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    component: null,
    loading: true,
    error: null,
  });

  const [retryKey, setRetryKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setRetryKey((prev) => prev + 1);
    setState({
      component: null,
      loading: true,
      error: null,
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadComponent = async (): Promise<void> => {
      try {
        setState((prev) => ({ ...prev, loading: true, _error: null }));
        const module = await importFn();

        if (!cancelled) {
          setState({
            component: module.default,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            component: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Import failed'),
          });
        }
      }
    };

    loadComponent();

    return (): void => {
      cancelled = true;
    };
  }, [importFn, retryKey, deps]);

  return {
    ...state,
    retry,
  };
}

/**
 * Preload a lazy component
 */
interface LazyComponentInternal<T> {
  _payload?: {
    _result?: () => Promise<{ default: ComponentType<T> }>;
  };
  _init?: (payload: unknown) => Promise<{ default: ComponentType<T> }>;
}

export function preloadLazyComponent<T>(
  lazyComponent: LazyExoticComponent<ComponentType<T>>
): Promise<{ default: ComponentType<T> }> {
  // Access the internal _payload to trigger loading
  const internalComponent =
    lazyComponent as unknown as LazyComponentInternal<T>;
  const payload = internalComponent._payload;
  if (payload && typeof payload._result === 'function') {
    return payload._result();
  }

  return new Promise((resolve, reject) => {
    try {
      const initializer = internalComponent._init;
      if (typeof initializer === 'function') {
        Promise.resolve(initializer(internalComponent._payload))
          .then((module: { default: ComponentType<T> } | ComponentType<T>) => {
            if (module && typeof module === 'object' && 'default' in module) {
              resolve({ default: module.default });
            } else {
              resolve({ default: module as ComponentType<T> });
            }
          })
          .catch(reject);
        return;
      }

      resolve({ default: lazyComponent as unknown as ComponentType<T> });
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error('Failed to preload lazy component')
      );
    }
  });
}

/**
 * Component for preloading lazy components on hover
 */
interface PreloadOnHoverProps {
  children: React.ReactNode;
  preload: () => Promise<unknown>;
  className?: string;
}

export function PreloadOnHover({
  children,
  preload,
  className = '',
}: PreloadOnHoverProps): React.JSX.Element {
  const [hasPreloaded, setHasPreloaded] = React.useState(false);

  const handleMouseEnter = React.useCallback(() => {
    if (!hasPreloaded) {
      setHasPreloaded(true);
      preload().catch(() => {
        /* Ignore preload errors */
      });
    }
  }, [hasPreloaded, preload]);

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onFocus={handleMouseEnter}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleMouseEnter();
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * Lazy component registry for managing loaded components
 */
class LazyComponentRegistry {
  private static readonly loadedComponents = new Set<string>();
  private static readonly preloadPromises = new Map<string, Promise<void>>();

  static markAsLoaded(componentName: string): void {
    this.loadedComponents.add(componentName);
  }

  static isLoaded(componentName: string): boolean {
    return this.loadedComponents.has(componentName);
  }

  static preload(
    componentName: string,
    importFn: () => Promise<unknown>
  ): Promise<void> {
    if (this.isLoaded(componentName)) {
      return Promise.resolve();
    }

    if (this.preloadPromises.has(componentName)) {
      return this.preloadPromises.get(componentName)!;
    }

    const promise: Promise<void> = importFn().then(() => {
      this.markAsLoaded(componentName);
      this.preloadPromises.delete(componentName);
    });

    this.preloadPromises.set(componentName, promise);
    return promise;
  }

  static getLoadedComponents(): string[] {
    return Array.from(this.loadedComponents);
  }

  static clear(): void {
    this.loadedComponents.clear();
    this.preloadPromises.clear();
  }
}

export { LazyComponentRegistry };
