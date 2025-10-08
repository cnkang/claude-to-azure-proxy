import { Request, Response, NextFunction } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { BaseError, isBaseError } from '../errors/index.js';

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
const sanitizeData = (data: unknown): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'authorization', 'x-api-key', 'cookie', 'set-cookie', 'password', 
      'token', 'key', 'secret', 'apikey', 'api_key', 'bearer', 'auth'
    ];

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }

    return sanitized;
  }

  return data;
};

const sanitizeString = (str: string): string => {
  return str
    // Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
    // Credit card numbers
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]')
    // SSN
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [TOKEN_REDACTED]')
    // API keys
    .replace(/api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi, 'api_key=[KEY_REDACTED]')
    // Phone numbers
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
};

// Sanitize sensitive headers and data
const sanitizeHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  return sanitizeData(headers) as Record<string, unknown>;
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
    environment: process.env.NODE_ENV || 'development'
  };

  if (metadata) {
    entry.metadata = sanitizeData(metadata) as Record<string, unknown>;
  }

  if (error) {
    entry.error = createErrorLogEntry(error);
  }

  if (performance) {
    entry.performance = performance;
  }

  if (security) {
    entry.security = security;
  }

  return entry;
};

// Create error log entry with proper sanitization
const createErrorLogEntry = (error: Error): ErrorLogEntry => {
  const errorEntry: ErrorLogEntry = {
    name: error.name,
    message: sanitizeString(error.message)
  };

  if (isBaseError(error)) {
    errorEntry.code = error.errorCode;
    errorEntry.statusCode = error.statusCode;
    errorEntry.isOperational = error.isOperational;
    errorEntry.context = sanitizeData(error.context) as Record<string, unknown>;
  }

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    errorEntry.stack = error.stack;
  }

  return errorEntry;
};

// Enhanced logger utility with comprehensive logging capabilities
export const logger = {
  info: (
    message: string, 
    correlationId: string = '', 
    metadata?: Record<string, unknown>,
    performance?: PerformanceLogEntry
  ): void => {
    const entry = createLogEntry('info', message, correlationId, metadata, undefined, performance);
    console.log(JSON.stringify(entry));
  },
  
  warn: (
    message: string, 
    correlationId: string = '', 
    metadata?: Record<string, unknown>
  ): void => {
    const entry = createLogEntry('warn', message, correlationId, metadata);
    console.warn(JSON.stringify(entry));
  },
  
  error: (
    message: string, 
    correlationId: string = '', 
    metadata?: Record<string, unknown>,
    error?: Error
  ): void => {
    const entry = createLogEntry('error', message, correlationId, metadata, error);
    console.error(JSON.stringify(entry));
  },

  critical: (
    message: string, 
    correlationId: string = '', 
    metadata?: Record<string, unknown>,
    error?: Error
  ): void => {
    const entry = createLogEntry('critical', message, correlationId, metadata, error);
    console.error(JSON.stringify(entry));
  },
  
  debug: (
    message: string, 
    correlationId: string = '', 
    metadata?: Record<string, unknown>
  ): void => {
    if (process.env.NODE_ENV === 'development') {
      const entry = createLogEntry('debug', message, correlationId, metadata);
      console.debug(JSON.stringify(entry));
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
      details: sanitizeData(details) as Record<string, unknown>
    };
    const entry = createLogEntry('warn', message, correlationId, undefined, undefined, undefined, security);
    console.warn(JSON.stringify(entry));
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
        details: sanitizeData(details)
      }
    };
    const level = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
    const entry = createLogEntry(level, message, correlationId, metadata);
    console.log(JSON.stringify(entry));
  },

  performance: (
    message: string,
    correlationId: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void => {
    const performance: PerformanceLogEntry = {
      duration,
      memoryUsage: process.memoryUsage()
    };
    const entry = createLogEntry('info', message, correlationId, metadata, undefined, performance);
    console.log(JSON.stringify(entry));
  }
};

// Request logging middleware
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId = (req as unknown as RequestWithCorrelationId).correlationId;
  
  // Log incoming request
  const requestLog: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    correlationId,
    message: 'Incoming request',
    service: 'claude-to-azure-proxy',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    request: {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      contentLength: req.headers['content-length'] ? parseInt(req.headers['content-length'] as string, 10) : undefined
    }
  };
  
  console.log(JSON.stringify(requestLog));
  
  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const responseLog: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? 'warn' : 'info',
      correlationId,
      message: 'Request completed',
      service: 'claude-to-azure-proxy',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      request: requestLog.request,
      response: {
        statusCode: res.statusCode,
        contentLength: res.get('content-length') ? parseInt(res.get('content-length') as string, 10) : undefined,
        responseTime
      }
    };
    
    console.log(JSON.stringify(responseLog));
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
  const correlationId = (req as unknown as RequestWithCorrelationId).correlationId || 'unknown';
  
  logger.error('Request error', correlationId, {
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    request: {
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers as Record<string, unknown>)
    }
  });
  
  next(error);
};