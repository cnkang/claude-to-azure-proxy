/**
 * Session Management Route Handler
 *
 * Handles session creation and management for frontend clients.
 * Provides session isolation without requiring user authentication.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import { isValidSessionId } from '../utils/validation.js';

// Session storage (in-memory for now, could be Redis in production)
interface SessionData {
  readonly id: string;
  readonly fingerprint: string;
  readonly createdAt: Date;
  readonly lastAccessed: Date;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

const sessions = new Map<string, SessionData>();

// Session configuration
const SESSION_CONFIG = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  maxSessions: 10000, // Prevent memory exhaustion
};

/**
 * Generate browser fingerprint for session isolation
 */
function generateBrowserFingerprint(req: Request): string {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const connection = req.headers.connection || '';

  // Create fingerprint from browser characteristics
  const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${connection}`;

  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccessed.getTime() > SESSION_CONFIG.maxAge) {
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.info('Cleaned up expired sessions', '', {
      cleanedCount,
      remainingSessions: sessions.size,
    });
  }
}

/**
 * Validate session access
 */
function validateSessionAccess(
  sessionId: string,
  fingerprint: string,
  correlationId: string
): SessionData | null {
  const session = sessions.get(sessionId);

  if (!session) {
    logger.warn('Session not found', correlationId, { sessionId });
    return null;
  }

  // Check if session has expired
  const now = Date.now();
  if (now - session.lastAccessed.getTime() > SESSION_CONFIG.maxAge) {
    sessions.delete(sessionId);
    logger.warn('Session expired', correlationId, { sessionId });
    return null;
  }

  // Validate fingerprint for security
  if (session.fingerprint !== fingerprint) {
    logger.warn('Session fingerprint mismatch', correlationId, {
      sessionId,
      expectedFingerprint: session.fingerprint.substring(0, 8),
      providedFingerprint: fingerprint.substring(0, 8),
    });
    return null;
  }

  return session;
}

// Start cleanup interval
setInterval(cleanupExpiredSessions, SESSION_CONFIG.cleanupInterval);

/**
 * Create new session endpoint
 * POST /api/session
 */
export const createSessionHandler = [
  // Input validation
  body('fingerprint').optional().isString().isLength({ min: 1, max: 100 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid session creation request',
          correlationId,
          'request',
          errors.array()
        );
      }

      // Check session limit
      if (sessions.size >= SESSION_CONFIG.maxSessions) {
        // Clean up expired sessions first
        cleanupExpiredSessions();

        if (sessions.size >= SESSION_CONFIG.maxSessions) {
          logger.warn('Session limit reached', correlationId, {
            currentSessions: sessions.size,
            maxSessions: SESSION_CONFIG.maxSessions,
          });

          res.status(503).json({
            error: {
              type: 'service_unavailable',
              message: 'Session limit reached. Please try again later.',
              correlationId,
            },
          });
          return;
        }
      }

      // Generate session ID and fingerprint
      const sessionId = uuidv4();
      const fingerprint =
        req.body.fingerprint || generateBrowserFingerprint(req);
      const now = new Date();

      // Create session data
      const sessionData: SessionData = {
        id: sessionId,
        fingerprint,
        createdAt: now,
        lastAccessed: now,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      };

      // Store session
      sessions.set(sessionId, sessionData);

      logger.info('Session created successfully', correlationId, {
        sessionId,
        fingerprint: fingerprint.substring(0, 8),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      // Return session information (no sensitive data)
      res.status(201).json({
        sessionId,
        fingerprint,
        createdAt: sessionData.createdAt.toISOString(),
        expiresAt: new Date(
          now.getTime() + SESSION_CONFIG.maxAge
        ).toISOString(),
        correlationId,
      });
    } catch (error) {
      logger.error('Session creation failed', correlationId, {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          error: {
            type: 'validation_error',
            message: error.message,
            correlationId,
          },
        });
      } else {
        res.status(500).json({
          error: {
            type: 'session_creation_error',
            message: 'Failed to create session',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Get session information endpoint
 * GET /api/session/:sessionId
 */
export const getSessionHandler = [
  // Input validation - accept both UUID and session_* format
  param('sessionId')
    .custom(isValidSessionId)
    .withMessage('Invalid session ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = req.params.sessionId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid session ID',
          correlationId,
          'sessionId',
          sessionId
        );
      }

      // Generate fingerprint for validation
      const fingerprint = generateBrowserFingerprint(req);

      // Validate session access
      const session = validateSessionAccess(
        sessionId,
        fingerprint,
        correlationId
      );

      if (!session) {
        res.status(404).json({
          error: {
            type: 'session_not_found',
            message: 'Session not found or expired',
            correlationId,
          },
        });
        return;
      }

      // Update last accessed time
      const updatedSession: SessionData = {
        ...session,
        lastAccessed: new Date(),
      };
      sessions.set(sessionId, updatedSession);

      logger.info('Session accessed successfully', correlationId, {
        sessionId,
        fingerprint: fingerprint.substring(0, 8),
      });

      // Return session information (no sensitive data)
      res.json({
        sessionId: session.id,
        fingerprint: session.fingerprint,
        createdAt: session.createdAt.toISOString(),
        lastAccessed: updatedSession.lastAccessed.toISOString(),
        expiresAt: new Date(
          updatedSession.lastAccessed.getTime() + SESSION_CONFIG.maxAge
        ).toISOString(),
        correlationId,
      });
    } catch (error) {
      logger.error('Session access failed', correlationId, {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          error: {
            type: 'validation_error',
            message: error.message,
            correlationId,
          },
        });
      } else {
        res.status(500).json({
          error: {
            type: 'session_access_error',
            message: 'Failed to access session',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Validate session middleware for other routes
 */
export const validateSessionMiddleware = async (
  req: Request,
  res: Response,
  next: () => void
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;
  const sessionId = req.headers['x-session-id'] as string;

  if (!sessionId) {
    res.status(400).json({
      error: {
        type: 'missing_session',
        message: 'Session ID required in x-session-id header',
        correlationId,
      },
    });
    return;
  }

  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    res.status(400).json({
      error: {
        type: 'invalid_session_format',
        message: 'Invalid session ID format',
        correlationId,
      },
    });
    return;
  }

  // Generate fingerprint for validation
  const fingerprint = generateBrowserFingerprint(req);

  // Validate session access or create new session if not exists
  let session = validateSessionAccess(sessionId, fingerprint, correlationId);

  if (!session) {
    // Auto-create session if it doesn't exist (for frontend-generated session IDs)
    logger.info(
      'Auto-creating session for frontend-generated session ID',
      correlationId,
      {
        sessionId,
      }
    );

    const newSession: SessionData = {
      id: sessionId,
      fingerprint,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    sessions.set(sessionId, newSession);
    session = newSession;
  }

  // Update last accessed time
  const updatedSession: SessionData = {
    ...session,
    lastAccessed: new Date(),
  };
  sessions.set(sessionId, updatedSession);

  // Add session info to request for downstream handlers
  (req as any).sessionId = sessionId;
  (req as any).sessionData = updatedSession;

  next();
};

/**
 * Get session statistics (for monitoring)
 */
export const getSessionStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    // Clean up expired sessions first
    cleanupExpiredSessions();

    const now = Date.now();
    let activeSessions = 0;
    let recentSessions = 0;

    for (const session of sessions.values()) {
      const lastAccessedAge = now - session.lastAccessed.getTime();

      if (lastAccessedAge < SESSION_CONFIG.maxAge) {
        activeSessions++;

        if (lastAccessedAge < 60 * 60 * 1000) {
          // Last hour
          recentSessions++;
        }
      }
    }

    res.json({
      totalSessions: sessions.size,
      activeSessions,
      recentSessions,
      maxSessions: SESSION_CONFIG.maxSessions,
      sessionMaxAge: SESSION_CONFIG.maxAge,
      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get session statistics', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'stats_error',
        message: 'Failed to get session statistics',
        correlationId,
      },
    });
  }
};
