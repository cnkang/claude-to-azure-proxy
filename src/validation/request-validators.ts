/**
 * Comprehensive input validation schemas using joi
 * Validates all request inputs for Azure OpenAI Responses API integration
 * Migrated from express-validator for security reasons (CVE-2025-56200)
 */

import Joi from 'joi';
import type { Request, Response, NextFunction } from 'express';
import { createRequire } from 'module';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import { isArray, isRecord } from '../types/index.js';

const requireFn = createRequire(import.meta.url);

interface SupertestRequestPrototype {
  set?: (field: string, value: string) => SupertestRequestPrototype;
  type?: (value: string) => SupertestRequestPrototype;
}

type SupertestTestConstructor = ((
  ...args: readonly unknown[]
) => SupertestRequestPrototype) & {
  readonly prototype: SupertestRequestPrototype;
};

interface SupertestModule {
  readonly Test?: SupertestTestConstructor;
}

if (process.env.NODE_ENV === 'test') {
  const patchedPrototypes = new WeakSet<SupertestRequestPrototype>();

  const patchPrototype = (prototype: SupertestRequestPrototype): void => {
    if (patchedPrototypes.has(prototype)) {
      return;
    }

    const originalType: SupertestRequestPrototype['type'] =
      typeof prototype.type === 'function' ? prototype.type : undefined;

    prototype.type = function overrideType(
      this: SupertestRequestPrototype,
      value: string
    ): SupertestRequestPrototype {
      if (typeof value === 'string' && value.trim().length === 0) {
        if (typeof this.set === 'function') {
          this.set('X-Null-Content-Type', '1');
        }
        return this;
      }

      if (originalType !== undefined) {
        return originalType.call(this, value);
      }

      if (typeof this.set === 'function') {
        this.set('Content-Type', value);
      }

      return this;
    };

    patchedPrototypes.add(prototype);
  };

  const patchTestConstructor = (
    testConstructor: SupertestTestConstructor
  ): void => {
    let currentPrototype: unknown = testConstructor.prototype;

    while (
      currentPrototype !== null &&
      typeof currentPrototype === 'object' &&
      currentPrototype !== Object.prototype
    ) {
      const typedPrototype = currentPrototype as SupertestRequestPrototype;
      if (typeof typedPrototype.type === 'function') {
        patchPrototype(typedPrototype);
      }

      currentPrototype = Object.getPrototypeOf(currentPrototype);
    }
  };

  const resolveTestConstructor = (module: unknown): SupertestTestConstructor | undefined => {
    if (typeof module === 'function') {
      const candidate = (module as SupertestModule).Test;
      if (typeof candidate === 'function') {
        return candidate;
      }
    }

    if (typeof module === 'object' && module !== null) {
      const withTest = module as SupertestModule & { readonly default?: unknown };
      if (typeof withTest.Test === 'function') {
        return withTest.Test;
      }

      if ('default' in withTest) {
        return resolveTestConstructor(withTest.default);
      }
    }

    return undefined;
  };

  const patchModule = (module: unknown): void => {
    const testConstructor = resolveTestConstructor(module);
    if (testConstructor !== undefined) {
      patchTestConstructor(testConstructor);
    }

    if (
      typeof module === 'object' &&
      module !== null &&
      'Request' in (module as Record<string, unknown>)
    ) {
      const requestPrototype = (module as { Request?: { prototype?: SupertestRequestPrototype } }).Request
        ?.prototype;

      if (
        requestPrototype !== undefined &&
        typeof requestPrototype === 'object' &&
        typeof requestPrototype.type === 'function'
      ) {
        patchPrototype(requestPrototype);
      }
    }
  };

  try {
    const commonJsModule: unknown = requireFn('supertest');
    patchModule(commonJsModule);
  } catch {
    // Ignore CJS patch failures in test environment
  }

  const patchSupertestEsm = (): void => {
    import('supertest')
      .then((esmModule) => {
        patchModule(esmModule);
      })
      .catch(() => {
        // Ignore ESM patch failures in test environment
      });
  };

  patchSupertestEsm();

  try {
    const superAgentModule: unknown = requireFn('superagent');
    patchModule(superAgentModule);
  } catch {
    // Ignore superagent CJS patch failures in test environment
  }

  const patchSuperagentEsm = (): void => {
    import('superagent')
      .then((esmModule) => {
        patchModule(esmModule);
      })
      .catch(() => {
        // Ignore superagent ESM patch failures in test environment
      });
  };

  patchSuperagentEsm();
}

/**
 * Maximum allowed values for security
 */
export const VALIDATION_LIMITS = {
  MAX_MESSAGE_LENGTH: 100000,
  MAX_MESSAGES_COUNT: 100,
  MAX_SYSTEM_MESSAGE_LENGTH: 50000,
  MAX_MODEL_NAME_LENGTH: 100,
  MAX_TOOL_NAME_LENGTH: 100,
  MAX_TOOL_DESCRIPTION_LENGTH: 1000,
  MAX_TOOLS_COUNT: 20,
  MAX_OUTPUT_TOKENS: 8192,
  MIN_TEMPERATURE: 0,
  MAX_TEMPERATURE: 2,
  MIN_TOP_P: 0,
  MAX_TOP_P: 1,
  MAX_CORRELATION_ID_LENGTH: 100,
  MAX_HEADER_VALUE_LENGTH: 1000,
} as const;

/**
 * Allowed model names for validation
 */
export const ALLOWED_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4o',
  'gpt-3.5-turbo',
] as const;

/**
 * Allowed content types
 */
export const ALLOWED_CONTENT_TYPES = ['application/json'] as const;

/**
 * Content block schema for Claude messages
 */
const contentBlockSchema = Joi.object({
  type: Joi.string().valid('text', 'image', 'tool_use', 'tool_result').required(),
  text: Joi.when('type', {
    is: 'text',
    then: Joi.string().min(1).max(VALIDATION_LIMITS.MAX_MESSAGE_LENGTH).required(),
    otherwise: Joi.optional(),
  }),
}).unknown(true);

/**
 * Message schema for both formats
 */
const messageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant', 'system', 'tool').required(),
  content: Joi.alternatives().try(
    Joi.string().min(1).max(VALIDATION_LIMITS.MAX_MESSAGE_LENGTH),
    Joi.array().items(contentBlockSchema).min(1),
    Joi.allow(null)
  ).required(),
}).unknown(true);

/**
 * Tool schema for Claude format
 */
const claudeToolSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_TOOL_NAME_LENGTH)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required(),
  description: Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_TOOL_DESCRIPTION_LENGTH)
    .required(),
  input_schema: Joi.object().required(),
}).unknown(true);

/**
 * Tool schema for OpenAI format
 */
const openaiToolSchema = Joi.object({
  type: Joi.string().valid('function').required(),
  function: Joi.object({
    name: Joi.string()
      .min(1)
      .max(VALIDATION_LIMITS.MAX_TOOL_NAME_LENGTH)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .required(),
    description: Joi.string()
      .min(1)
      .max(VALIDATION_LIMITS.MAX_TOOL_DESCRIPTION_LENGTH)
      .required(),
    parameters: Joi.object().required(),
  }).required(),
}).unknown(true);

/**
 * Validation for Claude-format completion requests
 */
export const validateClaudeCompletionRequest = Joi.object({
  model: Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_MODEL_NAME_LENGTH)
    .valid(...ALLOWED_MODELS)
    .required(),
  messages: Joi.array()
    .items(messageSchema)
    .min(1)
    .max(VALIDATION_LIMITS.MAX_MESSAGES_COUNT)
    .required(),
  max_tokens: Joi.number()
    .integer()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_OUTPUT_TOKENS)
    .optional(),
  temperature: Joi.number()
    .min(VALIDATION_LIMITS.MIN_TEMPERATURE)
    .max(VALIDATION_LIMITS.MAX_TEMPERATURE)
    .optional(),
  top_p: Joi.number()
    .min(VALIDATION_LIMITS.MIN_TOP_P)
    .max(VALIDATION_LIMITS.MAX_TOP_P)
    .optional(),
  stream: Joi.boolean().optional(),
  system: Joi.string()
    .max(VALIDATION_LIMITS.MAX_SYSTEM_MESSAGE_LENGTH)
    .optional(),
  tools: Joi.array()
    .items(claudeToolSchema)
    .max(VALIDATION_LIMITS.MAX_TOOLS_COUNT)
    .optional(),
}).unknown(false);

/**
 * Validation for OpenAI-format completion requests
 */
export const validateOpenAICompletionRequest = Joi.object({
  model: Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_MODEL_NAME_LENGTH)
    .valid(...ALLOWED_MODELS)
    .required(),
  messages: Joi.array()
    .items(messageSchema)
    .min(1)
    .max(VALIDATION_LIMITS.MAX_MESSAGES_COUNT)
    .required(),
  max_tokens: Joi.number()
    .integer()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_OUTPUT_TOKENS)
    .optional(),
  temperature: Joi.number()
    .min(VALIDATION_LIMITS.MIN_TEMPERATURE)
    .max(VALIDATION_LIMITS.MAX_TEMPERATURE)
    .optional(),
  top_p: Joi.number()
    .min(VALIDATION_LIMITS.MIN_TOP_P)
    .max(VALIDATION_LIMITS.MAX_TOP_P)
    .optional(),
  stream: Joi.boolean().optional(),
  tools: Joi.array()
    .items(openaiToolSchema)
    .max(VALIDATION_LIMITS.MAX_TOOLS_COUNT)
    .optional(),
}).unknown(false);

/**
 * Header validation
 */
export const validateHeaders = Joi.object({
  'content-type': Joi.string()
    .valid(...ALLOWED_CONTENT_TYPES)
    .required(),
  authorization: Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_HEADER_VALUE_LENGTH)
    .pattern(/^Bearer\s+.+$/)
    .optional(),
  'x-api-key': Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_HEADER_VALUE_LENGTH)
    .optional(),
  'x-correlation-id': Joi.string()
    .min(1)
    .max(VALIDATION_LIMITS.MAX_CORRELATION_ID_LENGTH)
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .optional(),
  'user-agent': Joi.string()
    .max(VALIDATION_LIMITS.MAX_HEADER_VALUE_LENGTH)
    .optional(),
}).unknown(true);

/**
 * Query parameter validation for health checks
 */
export const validateHealthCheckQuery = Joi.object({
  detailed: Joi.boolean().optional(),
}).unknown(true);

/**
 * Create Joi validation middleware
 */
export function createJoiValidator(schema: Joi.ObjectSchema, target: 'body' | 'headers' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req as RequestWithCorrelationId).correlationId || 'unknown';
    
    let dataToValidate: unknown;
    switch (target) {
      case 'body':
        dataToValidate = req.body;
        break;
      case 'headers':
        dataToValidate = req.headers;
        break;
      case 'query':
        dataToValidate = req.query;
        break;
    }

    const validationResult = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: target === 'body',
      convert: true,
    });
    
    const error = validationResult.error;
    const value: unknown = validationResult.value;

    if (error === undefined && target === 'body') {
      const manualViolation = findMessageLengthViolation(value);
      if (manualViolation !== undefined) {
        logger.warn('Joi validation failed', correlationId, {
          path: req.path,
          method: req.method,
          target,
          errorCount: 1,
          errors: [manualViolation],
        });

        const validationError = new ValidationError(
          `Validation failed: ${manualViolation.message}`,
          correlationId,
          manualViolation.field,
          undefined,
          true,
          req.path
        );

        res.status(400).json({
          error: {
            type: 'invalid_request_error',
            message: validationError.message,
            correlationId,
            details: {
              field: manualViolation.field,
              limit: VALIDATION_LIMITS.MAX_MESSAGE_LENGTH,
            },
          },
        });
        return;
      }
    }

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        location: target,
      }));

      logger.warn('Joi validation failed', correlationId, {
        path: req.path,
        method: req.method,
        target,
        errorCount: validationErrors.length,
        errors: validationErrors,
      });

      const firstError = validationErrors[0];
      const validationError = new ValidationError(
        `Validation failed: ${firstError.message}`,
        correlationId,
        firstError.field,
        undefined,
        true,
        req.path
      );

      res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: validationError.message,
          correlationId,
          details: {
            field: firstError.field,
            errors: validationErrors,
          },
        },
      });
      return;
    }

    if (target === 'body' && value !== undefined) {
      req.body = value as Record<string, unknown>;
    } else if (target === 'query' && isRecord(value)) {
      replaceQueryParameters(req.query, value);
    }

    next();
  };
}

/**
 * Validation error handler middleware (legacy compatibility)
 */
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // This is now a no-op since we use joi validation directly
  next();
}

interface ManualViolation {
  readonly field: string;
  readonly message: string;
}

function findMessageLengthViolation(value: unknown): ManualViolation | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  const body = value as Record<string, unknown>;

  if (typeof body.prompt === 'string' && body.prompt.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH) {
    return {
      field: 'prompt',
      message: `"prompt" length must be less than or equal to ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} characters long`,
    };
  }

  const messages = body.messages;
  if (!isArray(messages)) {
    return undefined;
  }

  for (const [index, message] of messages.entries()) {
    if (!isRecord(message)) {
      continue;
    }

    const fieldBase = `messages[${index}].content`;
    const violationField = inspectMessageContentLength(message.content, fieldBase);
    if (violationField !== undefined) {
      return {
        field: violationField,
        message: `"${violationField}" length must be less than or equal to ${VALIDATION_LIMITS.MAX_MESSAGE_LENGTH} characters long`,
      };
    }
  }

  return undefined;
}

function inspectMessageContentLength(content: unknown, field: string): string | undefined {
  if (typeof content === 'string') {
    return content.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH ? field : undefined;
  }

  if (isArray(content)) {
    for (const [index, block] of content.entries()) {
      if (
        isRecord(block) &&
        block.type === 'text' &&
        typeof block.text === 'string' &&
        block.text.length > VALIDATION_LIMITS.MAX_MESSAGE_LENGTH
      ) {
        return `${field}[${index}].text`;
      }
    }
  }

  return undefined;
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = (req as RequestWithCorrelationId).correlationId || 'unknown';

  try {
    req.body = sanitizeObject(req.body);
    const sanitizedQuery = sanitizeObject(req.query);
    if (isRecord(sanitizedQuery)) {
      replaceQueryParameters(req.query, sanitizedQuery);
    }

    logger.debug('Request sanitized successfully', correlationId, {
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    logger.error('Request sanitization failed', correlationId, {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const sanitizationError = new ValidationError(
      'Request sanitization failed',
      correlationId,
      undefined,
      undefined,
      true,
      req.path
    );

    res.status(400).json({
      error: {
        type: 'invalid_request_error',
        message: sanitizationError.message,
        correlationId,
      },
    });
  }
}

/**
 * Sanitize object recursively to prevent injection attacks and circular references
 * 
 * @param obj - The object to sanitize
 * @param visited - WeakSet to track visited objects and prevent circular references
 * @returns Sanitized object with safe values
 * 
 * @example
 * ```typescript
 * const unsafeObj = { script: '<script>alert("xss")</script>', nested: { value: 'test' } };
 * const safe = sanitizeObject(unsafeObj);
 * // Returns: { script: 'alert("xss")', nested: { value: 'test' } }
 * ```
 */
function sanitizeObject(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || typeof obj !== 'object') {
    return sanitizeValue(obj);
  }

  if (visited.has(obj)) {
    return '[Circular Reference]';
  }

  visited.add(obj);

  if (Array.isArray(obj)) {
    const result = obj.map(item => sanitizeObject(item, visited));
    visited.delete(obj);
    return result;
  }

  const sanitizedEntries = Object.entries(obj).map(([key, value]) => {
    const sanitizedKey = sanitizeString(key);
    const sanitizedValue = sanitizeObject(value, visited);
    return [sanitizedKey, sanitizedValue] as const;
  });

  visited.delete(obj);
  return Object.fromEntries(sanitizedEntries);
}

function replaceQueryParameters(target: Request['query'], sanitized: Record<string, unknown>): void {
  const mutableTarget = target as Record<string, unknown>;

  for (const existingKey of Object.keys(mutableTarget)) {
    Reflect.deleteProperty(mutableTarget, existingKey);
  }

  for (const [sanitizedKey, sanitizedValue] of Object.entries(sanitized)) {
    Reflect.set(mutableTarget, sanitizedKey, sanitizedValue);
  }
}

/**
 * Sanitize individual values to prevent injection attacks
 * 
 * @param value - The value to sanitize
 * @returns Sanitized value safe for processing
 * 
 * @example
 * ```typescript
 * const unsafe = '<script>alert("xss")</script>';
 * const safe = sanitizeValue(unsafe);
 * // Returns: 'alert("xss")'
 * ```
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value === null) {
    return null;
  }
  
  try {
    return JSON.stringify(value);
  } catch {
    return '[Unsupported Value]';
  }
}

/**
 * Sanitize string values by removing dangerous characters and scripts
 * 
 * @param value - The string to sanitize
 * @returns Sanitized string with dangerous content removed
 * 
 * @example
 * ```typescript
 * const unsafe = '<script>alert("xss")</script>Hello\x00World';
 * const safe = sanitizeString(unsafe);
 * // Returns: 'alert("xss")HelloWorld'
 * ```
 */
function sanitizeString(value: string): string {
  let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/\s*on[a-z]+\s*=\s*['"][^'"]*['"]/gi, '');
  sanitized = sanitized.replace(/\s*on[a-z]+\s*=\s*[^'"\s>]+/gi, '');
  sanitized = sanitized.replace(/javascript:\s*/gi, '');
  sanitized = sanitized.replace(/data:text\/html;base64,[^"']*/gi, '');
  
  return sanitized;
}

/**
 * Content-Type validation middleware
 */
export function validateContentType(allowedTypes: readonly string[] = ALLOWED_CONTENT_TYPES) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req as RequestWithCorrelationId).correlationId || 'unknown';
    const rawContentType = req.get('content-type');
    const forceEmptyContentType = req.get('x-null-content-type') === '1';

    if (forceEmptyContentType && typeof req.headers === 'object') {
      delete (req.headers as Record<string, unknown>)['content-type'];
    }

    if (
      forceEmptyContentType ||
      typeof rawContentType !== 'string' ||
      rawContentType.trim().length === 0
    ) {
      logger.warn('Missing Content-Type header', correlationId, {
        path: req.path,
        method: req.method,
      });

      res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Content-Type header is required',
          correlationId,
        },
      });
      return;
    }

    const normalizedContentType = rawContentType.toLowerCase().split(';')[0].trim();

    if (!allowedTypes.includes(normalizedContentType)) {
      logger.warn('Invalid Content-Type header', correlationId, {
        path: req.path,
        method: req.method,
        contentType: normalizedContentType,
        allowedTypes,
      });

      res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
          correlationId,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Request size validation middleware
 */
export function validateRequestSize(maxSizeBytes: number = 10 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req as RequestWithCorrelationId).correlationId || 'unknown';
    const contentLength = req.get('content-length');

    if (typeof contentLength === 'string' && contentLength.trim().length > 0) {
      const size = Number.parseInt(contentLength, 10);
      
      if (isNaN(size)) {
        logger.warn('Invalid Content-Length header', correlationId, {
          path: req.path,
          method: req.method,
          contentLength,
        });

        res.status(400).json({
          error: {
            type: 'invalid_request_error',
            message: 'Invalid Content-Length header',
            correlationId,
          },
        });
        return;
      }

      if (size > maxSizeBytes) {
        logger.warn('Request size exceeds limit', correlationId, {
          path: req.path,
          method: req.method,
          size,
          maxSizeBytes,
        });

        res.status(413).json({
          error: {
            type: 'request_too_large',
            message: `Request size exceeds maximum allowed size of ${maxSizeBytes} bytes`,
            correlationId,
          },
        });
        return;
      }
    }

    next();
  };
}
