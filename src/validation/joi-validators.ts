/**
 * Alternative validation implementation using Joi only
 * Can be used to replace express-validator if needed for security reasons
 */

import Joi from 'joi';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';

/**
 * Validation limits (same as express-validator implementation)
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
 * Allowed values
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

export const ALLOWED_CONTENT_TYPES = ['application/json'] as const;

/**
 * Joi schemas for validation
 */
const contentBlockSchema = Joi.object({
  type: Joi.string().valid('text', 'image', 'tool_use', 'tool_result').required(),
  text: Joi.when('type', {
    is: 'text',
    then: Joi.string().min(1).max(VALIDATION_LIMITS.MAX_MESSAGE_LENGTH).required(),
    otherwise: Joi.optional(),
  }),
}).unknown(true);

const messageSchema = Joi.object({
  role: Joi.string().valid('user', 'assistant', 'system', 'tool').required(),
  content: Joi.alternatives().try(
    Joi.string().min(1).max(VALIDATION_LIMITS.MAX_MESSAGE_LENGTH),
    Joi.array().items(contentBlockSchema).min(1),
    Joi.allow(null)
  ).required(),
}).unknown(true);

const toolSchema = Joi.object({
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
 * Claude completion request schema
 */
export const claudeCompletionSchema = Joi.object({
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
    .items(toolSchema)
    .max(VALIDATION_LIMITS.MAX_TOOLS_COUNT)
    .optional(),
}).unknown(false);

/**
 * OpenAI completion request schema
 */
export const openaiCompletionSchema = Joi.object({
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
 * Headers schema
 */
export const headersSchema = Joi.object({
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
      stripUnknown: target === 'body', // Only strip unknown for body validation
      convert: true,
    });
    
    const error = validationResult.error;
    const value: unknown = validationResult.value;

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

    // Update request with validated/sanitized data
    if (target === 'body' && value !== undefined) {
      req.body = value as Record<string, unknown>;
    }

    next();
  };
}

/**
 * Pre-configured validators
 */
export const validateClaudeRequestWithJoi = createJoiValidator(claudeCompletionSchema, 'body');
export const validateOpenAIRequestWithJoi = createJoiValidator(openaiCompletionSchema, 'body');
export const validateHeadersWithJoi = createJoiValidator(headersSchema, 'headers');