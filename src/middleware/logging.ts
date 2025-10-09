import { Request, Response, NextFunction } from 'express';
import type { IncomingHttpHeaders } from 'http';
import type { RequestWithCorrelationId } from '../types/index.js';
import { isBaseError } from '../errors/index.js';

/**
 * Enhanced structured logging middleware with correlation IDs and sanitized output
 * Provides comprehensive logging with error context and security considerations
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'critical';
  correlationId: string;
  message: string;
  service: string;
  version: string;
  environment: string;
  metadata?: Record<string, unknown>;
  error?: ErrorLogEntry;
  performance?: PerformanceLogEntry;
  security?: SecurityLogEntry;
}

export interface ErrorLogEntry {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface PerformanceLogEntry {
  readonly duration: number;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly cpuUsage?: NodeJS.CpuUsage;
}

export interface SecurityLogEntry {
  readonly event: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly source?: string;
  readonly details?: Record<string, unknown>;
}

export interface HealthLogEntry {
  readonly component: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly responseTime?: number;
  readonly details?: Record<string, unknown>;
}

interface RequestLogEntry extends LogEntry {
  request: {
    method: string;
    url: string;
    userAgent?: string | undefined;
    ip: string;
    contentLength?: number | undefined;
  };
  response?: {
    statusCode: number;
    contentLength?: number | undefined;
    responseTime: number;
  };
}

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
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [TOKEN_REDACTED]')
      // API keys
      .replace(
        /api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi,
        'api_key=[KEY_REDACTED]'
      )
      // Phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
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
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    message,
    service: 'claude-to-azure-proxy',
    version: '1.0.0',
    environment: getEnvironment(),
  };

  if (metadata !== undefined) {
    entry.metadata = sanitizeRecord(metadata);
  }

  if (error !== undefined) {
    entry.error = createErrorLogEntry(error);
  }

  if (performance !== undefined) {
    entry.performance = performance;
  }

  if (security !== undefined) {
    entry.security = security;
  }

  return entry;
};

// Create error log entry with proper sanitization
const createErrorLogEntry = (error: Error): ErrorLogEntry => {
  const errorEntry: ErrorLogEntry = {
    name: error.name,
    message: sanitizeString(error.message),
  };

  if (isBaseError(error)) {
    errorEntry.code = error.errorCode;
    errorEntry.statusCode = error.statusCode;
    errorEntry.isOperational = error.isOperational;
    errorEntry.context = sanitizeRecord(error.context);
  }

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    const stack = typeof error.stack === 'string' ? error.stack : undefined;
    if (stack !== undefined && stack.length > 0) {
      errorEntry.stack = stack;
    }
  }

  return errorEntry;
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
    correlationId: string = '',
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
    correlationId: string = '',
    metadata?: Record<string, unknown>
  ): void => {
    const entry = createLogEntry('warn', message, correlationId, metadata);
    writeStderr(entry);
  },

  error: (
    message: string,
    correlationId: string = '',
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
    correlationId: string = '',
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
    correlationId: string = '',
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
      source,
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

// Request logging middleware
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId = (req as unknown as RequestWithCorrelationId)
    .correlationId;

  const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const userAgentHeader = extractHeaderValue(req.headers['user-agent']);
  const contentLengthHeader = extractHeaderValue(req.headers['content-length']);
  const requestContentLength =
    contentLengthHeader !== undefined
      ? parseContentLength(contentLengthHeader)
      : undefined;

  const requestLog: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    correlationId,
    message: 'Incoming request',
    service: 'claude-to-azure-proxy',
    version: '1.0.0',
    environment: getEnvironment(),
    request: {
      method: req.method,
      url: req.url,
      userAgent: userAgentHeader,
      ip: clientIp,
      contentLength: requestContentLength,
    },
  };

  writeStdout(requestLog);

  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const responseContentLengthHeader = res.getHeader('content-length');
    const responseContentLength =
      responseContentLengthHeader !== undefined
        ? parseHeaderContentLength(responseContentLengthHeader)
        : undefined;

    const responseLog: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? 'warn' : 'info',
      correlationId,
      message: 'Request completed',
      service: 'claude-to-azure-proxy',
      version: '1.0.0',
      environment: getEnvironment(),
      request: requestLog.request,
      response: {
        statusCode: res.statusCode,
        contentLength: responseContentLength,
        responseTime,
      },
    };

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
    for (const entry of value) {
      const parsed =
        typeof entry === 'string' ? parseContentLength(entry) : undefined;
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  return undefined;
};

function getEnvironment(): string {
  return process.env.NODE_ENV ?? 'development';
}
