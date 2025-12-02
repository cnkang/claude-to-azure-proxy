// Shared utility functions for the monorepo

import { v4 as uuidv4 } from 'uuid';
// import type { RequestContext } from '../shared-types/src/index';

// Temporary type definition to avoid build issues
interface RequestContext {
  correlationId: string;
  timestamp: string;
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Generate a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return uuidv4();
}

/**
 * Create a request context with correlation ID and timestamp
 */
export function createRequestContext(
  correlationId?: string,
  userAgent?: string,
  ip?: string,
  method = 'GET',
  url = '/'
): RequestContext {
  return {
    correlationId: correlationId ?? generateCorrelationId(),
    timestamp: new Date().toISOString(),
    method,
    url,
    userAgent,
    ip,
  };
}

/**
 * Sanitize error messages for client responses
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
  return (
    typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)
  );
}

/**
 * Deep freeze an object to make it immutable
 */
export function deepFreeze<T extends Record<string, unknown>>(
  obj: T
): Readonly<T> {
  for (const prop of Object.getOwnPropertyNames(obj)) {
    // eslint-disable-next-line security/detect-object-injection
    const value = obj[prop];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return Object.freeze(obj);
}

/**
 * Create a delay promise for testing and retry logic
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(date: Readonly<Date> = new Date()): string {
  return date.toISOString();
}

/**
 * Parse environment variable as integer with default value
 */
export function parseEnvInt(
  value: string | undefined,
  defaultValue: number
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return isValidNumber(parsed) ? parsed : defaultValue;
}

/**
 * Parse environment variable as boolean with default value
 */
export function parseEnvBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const lowerValue = value.toLowerCase();
  if (lowerValue === 'true') {
    return true;
  }
  if (lowerValue === 'false') {
    return false;
  }
  return defaultValue;
}

/**
 * Debounce function to limit the rate of function calls
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | number | undefined;

  return (...args: Parameters<T>): void => {
    const later = (): void => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit the rate of function calls
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>): void => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delayMs = baseDelay * 2 ** (attempt - 1);
      await delay(delayMs);
    }
  }

  throw new Error('All retry attempts failed');
}

/**
 * Create a promise that resolves after a timeout
 */
export function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

/**
 * Check if code is running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if code is running in Node.js environment
 */
export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    'node' in process.versions
  );
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Safe JSON stringify with error handling
 */
export function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Calculate storage usage percentage
 */
export function calculateStorageUsage(used: number, quota: number): number {
  if (quota === 0) {
    return 0;
  }
  return Math.round((used / quota) * 100);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // eslint-disable-next-line security/detect-object-injection
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a hash code from a string
 */
export function hashCode(str: string): number {
  let hash = 0;

  if (str.length === 0) {
    return hash;
  }

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }

  return hash;
}
