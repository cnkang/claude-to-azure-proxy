/**
 * Shared logging type definitions used by both backend and frontend components.
 * Aligns with the structured logging schema implemented in the backend middleware.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'critical';

export interface ErrorLogEntry {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly isOperational?: boolean;
  readonly stack?: string;
  readonly context?: Record<string, unknown>;
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

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly correlationId: string;
  readonly message: string;
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly metadata?: Record<string, unknown>;
  readonly error?: ErrorLogEntry;
  readonly performance?: PerformanceLogEntry;
  readonly security?: SecurityLogEntry;
  readonly health?: HealthLogEntry;
}

export interface RequestLogEntry extends LogEntry {
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly userAgent?: string;
    readonly ip: string;
    readonly contentLength?: number;
  };
  readonly response?: {
    readonly statusCode: number;
    readonly contentLength?: number;
    readonly responseTime: number;
  };
}
