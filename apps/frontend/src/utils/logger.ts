/**
 * Development logger utility
 * Only logs in development mode to avoid console errors in production
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG]', ...args);
    }
  },

  log: (...args: unknown[]): void => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },

  info: (...args: unknown[]): void => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },

  warn: (...args: unknown[]): void => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },

  error: (...args: unknown[]): void => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  },
};

// Alias for backward compatibility
export const frontendLogger = logger;
