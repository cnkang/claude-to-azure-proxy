// Test utility types for proper TypeScript support
import { vi, expect } from 'vitest';
import type { Request, NextFunction } from 'express';
import type { MockedFunction } from 'vitest';

// Mock Express objects with proper typing
export interface MockRequest extends Partial<Request> {
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown> | string | null;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  url?: string;
  correlationId?: string;
  // Authentication properties
  authMethod?: string;
  authResult?: string;
}

export interface MockResponse {
  status: MockedFunction<(code: number) => MockResponse>;
  json: MockedFunction<(body?: unknown) => MockResponse>;
  send: MockedFunction<(body?: unknown) => MockResponse>;
  end: MockedFunction<() => MockResponse>;
  setHeader: MockedFunction<(name: string, value: string | string[]) => MockResponse>;
}

export type MockNextFunction = MockedFunction<NextFunction>;

// Test error types
export interface TestError extends Error {
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
  toClientError?: () => { message: string; type: string };
}

// Mock configuration type
export interface MockConfig {
  PROXY_API_KEY: string;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_OPENAI_MODEL: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
}

// Mock logger type
export interface MockLogger {
  info: MockedFunction<(...args: unknown[]) => void>;
  warn: MockedFunction<(...args: unknown[]) => void>;
  error: MockedFunction<(...args: unknown[]) => void>;
  debug: MockedFunction<(...args: unknown[]) => void>;
}

// Mock axios response type
export interface MockAxiosResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: unknown;
}

// Mock axios error type
export interface MockAxiosError extends Error {
  response?: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
  };
  request?: unknown;
  config?: unknown;
  code?: string;
}

// Type-safe expect matchers
export const expectString = expect.stringMatching(/.*/) as string;
export const expectNumber = expect.any(Number) as number;
export const expectBoolean = expect.any(Boolean) as boolean;
export const expectObject = expect.any(Object) as object;
export const expectArray = expect.any(Array) as Array<unknown>;
export const expectFunction = expect.any(Function) as () => void

// Helper function to create properly typed mock response
export function createMockResponse(): MockResponse {
  const mockResponse = {} as MockResponse;
  return {
    status: vi.fn().mockReturnValue(mockResponse),
    json: vi.fn().mockReturnValue(mockResponse),
    send: vi.fn().mockReturnValue(mockResponse),
    end: vi.fn().mockReturnValue(mockResponse),
    setHeader: vi.fn().mockReturnValue(mockResponse),
  };
}

// Helper function to create properly typed mock request
export function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    method: 'GET',
    url: '/',
    correlationId: 'test-correlation-id',
    ...overrides,
  };
}