/**
 * Frontend Logger Utility
 *
 * Provides structured logging for the frontend application with
 * different log levels and error handling.
 */

export interface LogEntry {
  readonly timestamp: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly error?: Error;
}

/**
 * Frontend logger class
 */
class FrontendLogger {
  private readonly isDevelopment = import.meta.env.DEV;

  /**
   * Log debug message
   */
  public debug(message: string, metadata?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      this.log('debug', message, metadata);
    }
  }

  /**
   * Log info message
   */
  public info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log warning message
   */
  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log error message
   */
  public error(
    message: string,
    options?: { metadata?: Record<string, unknown>; error?: Error }
  ): void {
    this.log('error', message, options?.metadata, options?.error);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogEntry['level'],
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      error,
    };

    // Console output in development
    if (this.isDevelopment) {
      const devConsole =
        typeof globalThis !== 'undefined' ? globalThis.console : undefined;
      if (devConsole) {
        const logMessage = `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`;
        const logArgs = [
          logMessage,
          ...(metadata ? [metadata] : []),
          ...(error ? [error] : []),
        ];

        switch (level) {
          case 'debug':
            devConsole.log(...logArgs);
            break;
          case 'info':
            devConsole.info(...logArgs);
            break;
          case 'warn':
            devConsole.warn(...logArgs);
            break;
          case 'error':
            devConsole.error(...logArgs);
            break;
          default:
            devConsole.log(...logArgs);
        }
      }
    }

    // In production, you might want to send logs to a service
    if (!this.isDevelopment && level === 'error') {
      // Could send to error tracking service here
      this.sendToErrorService(entry);
    }
  }

  /**
   * Send error to external service (placeholder)
   */
  private sendToErrorService(_entry: LogEntry): void {
    // Placeholder for error tracking service integration
    // e.g., Sentry, LogRocket, etc.
    try {
      // Example: window.errorTracker?.captureException(entry.error, { extra: entry.metadata });
    } catch {
      // Silently fail to avoid logging loops
    }
  }
}

/**
 * Global frontend logger instance
 */
export const frontendLogger = new FrontendLogger();
