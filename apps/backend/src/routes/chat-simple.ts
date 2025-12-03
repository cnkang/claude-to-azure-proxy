/**
 * Simple Chat Route Handler (Without SSE)
 *
 * Provides a simple non-streaming chat endpoint for testing purposes.
 * This bypasses the SSE complexity and returns the complete response at once.
 */

import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import { getStreamingService } from '../services/streaming-service.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import { isValidConversationId } from '../utils/validation.js';

interface RequestWithSession extends RequestWithCorrelationId {
  sessionId: string;
}

interface SimpleChatRequest {
  readonly message: string;
  readonly model: string;
  readonly conversationId: string;
}

/**
 * Simple chat endpoint without streaming
 * POST /api/chat/simple
 */
export const simpleChatHandler = [
  // Input validation
  body('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),
  body('message').isString().isLength({ min: 1, max: 100000 }),
  body('model').isString().isLength({ min: 1, max: 100 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as RequestWithSession).sessionId;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.error('Validation errors in simple chat', correlationId, {
          errors: errors.array(),
          body: req.body,
        });
        throw new ValidationError(
          'Invalid chat message request',
          correlationId,
          'request',
          errors.array()
        );
      }

      const { message, model, conversationId } = req.body as SimpleChatRequest;

      logger.info('Processing simple chat message', correlationId, {
        conversationId,
        sessionId,
        messageLength: message.length,
        model,
      });

      // Collect the complete response
      let completeResponse = '';
      const messageId = uuidv4();

      const streamingService = getStreamingService();

      // Create streaming response handler
      const handler = {
        onStart: (msgId: string, model: string) => {
          logger.info('Simple chat response started', correlationId, {
            messageId: msgId,
            model,
          });
        },

        onChunk: (content: string, _msgId: string) => {
          completeResponse += content;
        },

        onEnd: (msgId: string, usage?: any) => {
          logger.info('Simple chat response completed', correlationId, {
            messageId: msgId,
            model,
            usage,
            responseLength: completeResponse.length,
          });
        },

        onError: (error: string, msgId: string) => {
          logger.error('Simple chat response failed', correlationId, {
            messageId: msgId,
            error,
          });
        },
      };

      // Process the streaming request
      const request = {
        message,
        model,
        conversationId,
        files: undefined,
        contextMessages: [],
      };

      await streamingService.processStreamingRequest(
        request,
        handler,
        correlationId
      );

      // Return the complete response
      res.json({
        messageId,
        response: completeResponse,
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to process simple chat message', correlationId, {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          error: {
            type: error.errorCode,
            message: error.message,
            correlationId,
          },
        });
      } else {
        res.status(500).json({
          error: {
            type: 'internal_error',
            message: 'Failed to process chat message',
            correlationId,
          },
        });
      }
    }
  },
];
