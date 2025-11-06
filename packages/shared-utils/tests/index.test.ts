import { describe, it, expect } from 'vitest';
import {
  generateCorrelationId,
  createRequestContext,
  sanitizeErrorMessage,
  isNonEmptyString,
  isValidNumber,
  deepFreeze,
  formatTimestamp,
  parseEnvInt,
  parseEnvBoolean,
} from '../src/index';

describe('shared-utils', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRequestContext', () => {
    it('should create context with generated correlation ID', () => {
      const context = createRequestContext();
      expect(context.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(context.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should use provided correlation ID', () => {
      const correlationId = 'test-id';
      const context = createRequestContext(correlationId);
      expect(context.correlationId).toBe(correlationId);
    });

    it('should include optional parameters', () => {
      const context = createRequestContext(
        'test-id',
        'Mozilla/5.0',
        '127.0.0.1'
      );
      expect(context.userAgent).toBe('Mozilla/5.0');
      expect(context.ip).toBe('127.0.0.1');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should return error message for Error objects', () => {
      const error = new Error('Test error');
      expect(sanitizeErrorMessage(error)).toBe('Test error');
    });

    it('should return string errors as-is', () => {
      expect(sanitizeErrorMessage('String error')).toBe('String error');
    });

    it('should return default message for unknown errors', () => {
      expect(sanitizeErrorMessage(null)).toBe('An unexpected error occurred');
      expect(sanitizeErrorMessage(undefined)).toBe(
        'An unexpected error occurred'
      );
      expect(sanitizeErrorMessage(123)).toBe('An unexpected error occurred');
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  test  ')).toBe(true);
    });

    it('should return false for empty or non-string values', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe('isValidNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(123)).toBe(true);
      expect(isValidNumber(-456)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
      expect(isValidNumber('123')).toBe(false);
      expect(isValidNumber(null)).toBe(false);
    });
  });

  describe('deepFreeze', () => {
    it('should freeze object and nested objects', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3,
          },
        },
      };

      const frozen = deepFreeze(obj);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.b)).toBe(true);
      expect(Object.isFrozen(frozen.b.d)).toBe(true);
    });
  });

  describe('formatTimestamp', () => {
    it('should format date as ISO string', () => {
      const date = new Date('2023-01-01T12:00:00.000Z');
      expect(formatTimestamp(date)).toBe('2023-01-01T12:00:00.000Z');
    });

    it('should use current date if none provided', () => {
      const timestamp = formatTimestamp();
      expect(timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('parseEnvInt', () => {
    it('should parse valid integer strings', () => {
      expect(parseEnvInt('123', 0)).toBe(123);
      expect(parseEnvInt('-456', 0)).toBe(-456);
    });

    it('should return default for invalid values', () => {
      expect(parseEnvInt('invalid', 42)).toBe(42);
      expect(parseEnvInt(undefined, 42)).toBe(42);
      expect(parseEnvInt('', 42)).toBe(42);
    });
  });

  describe('parseEnvBoolean', () => {
    it('should parse boolean strings', () => {
      expect(parseEnvBoolean('true', false)).toBe(true);
      expect(parseEnvBoolean('TRUE', false)).toBe(true);
      expect(parseEnvBoolean('false', true)).toBe(false);
      expect(parseEnvBoolean('FALSE', true)).toBe(false);
    });

    it('should return default for invalid values', () => {
      expect(parseEnvBoolean('invalid', true)).toBe(true);
      expect(parseEnvBoolean(undefined, false)).toBe(false);
      expect(parseEnvBoolean('', true)).toBe(true);
    });
  });
});
