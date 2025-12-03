import type { IncomingHttpHeaders } from 'node:http';
import { performance } from 'node:perf_hooks';
import type {
  ErrorLogEntry,
  HealthLogEntry,
  LogEntry,
  PerformanceLogEntry,
  RequestLogEntry,
  SecurityLogEntry,
} from '@repo/shared-types';
import type { NextFunction, Request, Response } from 'express';
import { isBaseError } from '../errors/index';
import type { RequestWithCorrelationId } from '../types/index.js';
import { resolveCorrelationId } from '../utils/correlation-id';

/**
 * Enhanced structured logging middleware with correlation IDs and sanitized output.
 * Shared log entry types are provided by @repo/shared-types to ensure parity
 * between backend and frontend logging implementations.
 */

// Enhanced sanitization for sensitive data
const sensitiveKeys = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'key',
  'secret',
  'apikey',
  'api_key',
  'bearer',
  'auth',
  'endpoint',
] as const;

function sanitizeRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  const sanitizedEntries = Object.entries(record).map(([key, value]) => {
    const lowerKey = key.toLowerCase();
    const shouldRedact = sensitiveKeys.some((sensitive) =>
      lowerKey.includes(sensitive)
    );
    const sanitizedValue = shouldRedact ? '[REDACTED]' : sanitizeData(value);
    return [key, sanitizedValue] as const;
  });

  return Object.fromEntries(sanitizedEntries);
}

function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  if (typeof data === 'object') {
    return sanitizeRecord(data as Record<string, unknown>);
  }

  return data;
}

const sanitizeString = (str: string): string => {
  return (
    str
      // Email addresses
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '[EMAIL_REDACTED]'
      )
      // Credit card numbers
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]')
      // SSN
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
      // Bearer tokens
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      // API keys
      .replace(
        /api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi,
        'api_key=[REDACTED]'
      )
      // Phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED]')
  );
};

// Sanitize sensitive headers and data
const sanitizeHeaders = (
  headers: IncomingHttpHeaders
): Record<string, unknown> => {
  return sanitizeRecord(headers as unknown as Record<string, unknown>);
};

// Create structured log entry with enhanced context
const createLogEntry = (
  level: LogEntry['level'],
  message: string,
  correlationId: string,
  metadata?: Record<string, unknown>,
  error?: Error,
  performance?: PerformanceLogEntry,
  security?: SecurityLogEntry
): LogEntry => {
  return {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    message,
    service: 'claude-to-azure-proxy',
    version: '2.0.0',
    environment: getEnvironment(),
    ...(metadata !== undefined ? { metadata: sanitizeRecord(metadata) } : {}),
    ...(error !== undefined ? { error: createErrorLogEntry(error) } : {}),
    ...(performance !== undefined ? { performance } : {}),
    ...(security !== undefined ? { security } : {}),
  };
};

// Create error log entry with proper sanitization
const createErrorLogEntry = (error: Error): ErrorLogEntry => {
  const baseEntry = {
    name: error.name,
    message: sanitizeString(error.message),
  };

  const baseErrorFields = isBaseError(error)
    ? {
        code: error.errorCode,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        context: sanitizeRecord(
          error.context as unknown as Record<string, unknown>
        ),
      }
    : {};

  // Only include stack trace in development
  const stack =
    process.env.NODE_ENV === 'development' && typeof error.stack === 'string'
      ? error.stack
      : undefined;
  const stackField = stack !== undefined && stack.length > 0 ? { stack } : {};

  return {
    ...baseEntry,
    ...baseErrorFields,
    ...stackField,
  };
};

// Enhanced logger utility with comprehensive logging capabilities
const writeStdout = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const writeStderr = (payload: unknown): void => {
  process.stderr.write(`${JSON.stringify(payload)}\n`);
};

export const logger = {
  info: (
    message: string,
    correlationId = '',
    metadata?: Record<string, unknown>,
    performance?: PerformanceLogEntry
  ): void => {
    const entry = createLogEntry(
      'info',
      message,
      correlationId,
      metadata,
      undefined,
      performance
    );
    writeStdout(entry);
  },

  warn: (
    message: string,
    correlationId = '',
    metadata?: Record<string, unknown>
  ): void => {
    const entry = createLogEntry('warn', message, correlationId, metadata);
    writeStderr(entry);
  },

  error: (
    message: string,
    correlationId = '',
    metadata?: Record<string, unknown>,
    error?: Error
  ): void => {
    const entry = createLogEntry(
      'error',
      message,
      correlationId,
      metadata,
      error
    );
    writeStderr(entry);
  },

  critical: (
    message: string,
    correlationId = '',
    metadata?: Record<string, unknown>,
    error?: Error
  ): void => {
    const entry = createLogEntry(
      'critical',
      message,
      correlationId,
      metadata,
      error
    );
    writeStderr(entry);
  },

  debug: (
    message: string,
    correlationId = '',
    metadata?: Record<string, unknown>
  ): void => {
    if (process.env.NODE_ENV === 'development') {
      const entry = createLogEntry('debug', message, correlationId, metadata);
      writeStdout(entry);
    }
  },

  security: (
    message: string,
    correlationId: string,
    event: string,
    severity: SecurityLogEntry['severity'],
    source?: string,
    details?: Record<string, unknown>
  ): void => {
    const security: SecurityLogEntry = {
      event,
      severity,
      source: source ?? undefined,
      details: sanitizeData(details) as Record<string, unknown>,
    };
    const entry = createLogEntry(
      'warn',
      message,
      correlationId,
      undefined,
      undefined,
      undefined,
      security
    );
    writeStderr(entry);
  },

  health: (
    message: string,
    correlationId: string,
    component: string,
    status: HealthLogEntry['status'],
    responseTime?: number,
    details?: Record<string, unknown>
  ): void => {
    const metadata = {
      health: {
        component,
        status,
        responseTime,
        details: sanitizeData(details),
      },
    };
    const level =
      status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
    const entry = createLogEntry(level, message, correlationId, metadata);
    writeStdout(entry);
  },

  performance: (
    message: string,
    correlationId: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void => {
    const performance: PerformanceLogEntry = {
      duration,
      memoryUsage: process.memoryUsage(),
    };
    const entry = createLogEntry(
      'info',
      message,
      correlationId,
      metadata,
      undefined,
      performance
    );
    writeStdout(entry);
  },
};

// Request logging middleware with conversation tracking support
/**
 * Extract conversation ID from request headers
 */
function extractConversationId(headers: IncomingHttpHeaders): string | undefined {
  return (
    extractHeaderValue(headers['x-conversation-id']) ??
    extractHeaderValue(headers['conversation-id']) ??
    extractHeaderValue(headers['x-session-id']) ??
    extractHeaderValue(headers['session-id'])
  );
}

/**
 * Build request log entry
 */
function buildRequestLogEntry(
  req: Request,
  correlationId: string,
  conversationId: string | undefined
): RequestLogEntry & { conversationId?: string } {
  const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const userAgentHeader = extractHeaderValue(req.headers['user-agent']);
  const contentLengthHeader = extractHeaderValue(req.headers['content-length']);
  const requestContentLength =
    contentLengthHeader !== undefined
      ? parseContentLength(contentLengthHeader)
      : undefined;

  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    correlationId,
    message: 'Incoming request',
    service: 'claude-to-azure-proxy',
    version: '2.0.0',
    environment: getEnvironment(),
    request: {
      method: req.method,
      url: req.url,
      userAgent: userAgentHeader,
      ip: clientIp,
      contentLength: requestContentLength,
    },
    ...(conversationId !== undefined ? { conversationId } : {}),
  };
}

/**
 * Extract format metadata from request
 */
function extractFormatMetadata(req: Request): {
  requestFormat?: string;
  responseFormat?: string;
  reasoningEffort?: string;
  conversationComplexity?: string;
} {
  const requestWithFormat = req as unknown as {
    requestFormat?: string;
    responseFormat?: string;
    reasoningEffort?: string;
    conversationComplexity?: string;
  };

  return {
    ...(typeof requestWithFormat.requestFormat === 'string'
      ? { requestFormat: requestWithFormat.requestFormat }
      : {}),
    ...(typeof requestWithFormat.responseFormat === 'string'
      ? { responseFormat: requestWithFormat.responseFormat }
      : {}),
    ...(typeof requestWithFormat.reasoningEffort === 'string'
      ? { reasoningEffort: requestWithFormat.reasoningEffort }
      : {}),
    ...(typeof requestWithFormat.conversationComplexity === 'string'
      ? { conversationComplexity: requestWithFormat.conversationComplexity }
      : {}),
  };
}

/**
 * Build response log entry
 */
function buildResponseLogEntry(
  req: Request,
  res: Response,
  correlationId: string,
  conversationId: string | undefined,
  requestLog: RequestLogEntry,
  startTime: number
): RequestLogEntry & {
  conversationId?: string;
  requestFormat?: string;
  responseFormat?: string;
  reasoningEffort?: string;
  conversationComplexity?: string;
} {
  const responseTime = Math.round(performance.now() - startTime);
  const responseContentLengthHeader = res.getHeader('content-length');
  const responseContentLength =
    responseContentLengthHeader !== undefined
      ? parseHeaderContentLength(responseContentLengthHeader)
      : undefined;

  const formatMetadata = extractFormatMetadata(req);

  return {
    timestamp: new Date().toISOString(),
    level: res.statusCode >= 400 ? 'warn' : 'info',
    correlationId,
    message: 'Request completed',
    service: 'claude-to-azure-proxy',
    version: '2.0.0',
    environment: getEnvironment(),
    request: requestLog.request,
    response: {
      statusCode: res.statusCode,
      contentLength: responseContentLength,
      responseTime,
    },
    ...(conversationId !== undefined ? { conversationId } : {}),
    ...formatMetadata,
  };
}

export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = performance.now();
  const correlationId = resolveCorrelationId(
    (req as Partial<RequestWithCorrelationId>).correlationId,
    () => 'unknown'
  );

  const conversationId = extractConversationId(req.headers);
  const requestLog = buildRequestLogEntry(req, correlationId, conversationId);

  writeStdout(requestLog);

  res.on('finish', () => {
    const responseLog = buildResponseLogEntry(
      req,
      res,
      correlationId,
      conversationId,
      requestLog,
      startTime
    );
    writeStdout(responseLog);
  });

  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (
  error: Error,
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const correlationId =
    (req as unknown as RequestWithCorrelationId).correlationId || 'unknown';

  logger.error('Request error', correlationId, {
    error: {
      name: error.name,
      message: error.message,
      stack:
        process.env.NODE_ENV === 'development' &&
        typeof error.stack === 'string' &&
        error.stack.length > 0
          ? error.stack
          : undefined,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers),
    },
  });

  next(error);
};

const extractHeaderValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        return entry.trim();
      }
    }
  }

  return undefined;
};

const parseContentLength = (value: string): number | undefined => {
  if (value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/**
 * Parse content length from array of strings
 */
const parseContentLengthFromArray = (
  value: readonly string[]
): number | undefined => {
  for (const entry of value) {
    const parsed =
      typeof entry === 'string' ? parseContentLength(entry) : undefined;
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
};

const parseHeaderContentLength = (
  value: number | string | readonly string[]
): number | undefined => {
  if (typeof value === 'number') {
    return value >= 0 ? value : undefined;
  }

  if (typeof value === 'string') {
    return parseContentLength(value);
  }

  if (Array.isArray(value)) {
    return parseContentLengthFromArray(value);
  }

  return undefined;
};

function getEnvironment(): string {
  return process.env.NODE_ENV ?? 'development';
}
