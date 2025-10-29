import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { ServerConfig } from '../src/types/index.js';
import { ProxyServer, createServerConfig, setupGracefulShutdown } from '../src/index.js';
import { testConfig, testServerConfig, validApiKey } from './test-config.js';

const {
  loggerMock,
  registerHealthCheck,
  startMonitoring,
  stopMonitoring,
  completionsRouteHandler,
  completionsHandlerFactory,
} = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn(),
  };

  const registerHealthCheck = vi.fn();
  const startMonitoring = vi.fn();
  const stopMonitoring = vi.fn();
  const completionsRouteHandler = vi.fn((req, res) => {
    res.status(200).json({ ok: true, correlationId: (req as { correlationId?: string }).correlationId });
  });
  const completionsHandlerFactory = vi.fn(() => completionsRouteHandler);

  return {
    loggerMock,
    registerHealthCheck,
    startMonitoring,
    stopMonitoring,
    completionsRouteHandler,
    completionsHandlerFactory,
  };
});

vi.mock('../src/middleware/logging.js', () => ({
  logger: loggerMock,
  requestLoggingMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  errorLoggingMiddleware: (_err: unknown, _req: unknown, _res: unknown, next: (error?: unknown) => void) => next(_err),
}));

vi.mock('../src/monitoring/health-monitor.js', () => ({
  getHealthMonitor: vi.fn(() => ({
    registerHealthCheck,
    startMonitoring,
    stopMonitoring,
  })),
}));

vi.mock('../src/routes/completions.js', () => ({
  completionsHandler: completionsHandlerFactory,
  completionsRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../src/resilience/graceful-degradation.js', () => ({
  checkFeatureAvailability: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));


const createProxyServer = (): ProxyServer => {
  const config: ServerConfig = {
    ...testServerConfig,
    port: 0,
    azureOpenAI: testServerConfig.azureOpenAI
      ? { ...testServerConfig.azureOpenAI }
      : undefined,
  };

  return new ProxyServer(config);
};

const getAppFromServer = (server: ProxyServer): Application => {
  return (server as unknown as { app: Application }).app;
};

describe('ProxyServer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completionsRouteHandler.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    completionsRouteHandler.mockClear();
  });

  it('creates a server config with sanitized Azure settings', () => {
    const serverConfig = createServerConfig(testConfig);

    expect(serverConfig.port).toBe(testConfig.PORT);
    expect(serverConfig.proxyApiKey).toBe(testConfig.PROXY_API_KEY);
    expect(serverConfig.azureOpenAI?.deployment).toBe(testConfig.AZURE_OPENAI_MODEL);
    expect(serverConfig.azureOpenAI?.endpoint).toBe(testConfig.AZURE_OPENAI_ENDPOINT);
  });

  it('serves service metadata with correlation IDs on the root endpoint', async () => {
    const server = createProxyServer();
    const app = getAppFromServer(server);

    const response = await request(app)
      .get('/')
      .set('x-correlation-id', 'server-test-correlation');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: 'Claude-to-Azure Proxy',
      status: 'running',
      correlationId: 'server-test-correlation',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Root endpoint accessed',
      'server-test-correlation'
    );
  });

  it('initializes health monitoring when invoked explicitly', () => {
    const server = createProxyServer();
    const hooks = server as unknown as { setupHealthMonitoring: () => void };
    hooks.setupHealthMonitoring();

    expect(registerHealthCheck).toHaveBeenCalled();
    expect(startMonitoring).toHaveBeenCalledWith(60000);
  });

  it('rejects unauthorized requests to protected routes', async () => {
    const server = createProxyServer();
    const app = getAppFromServer(server);

    const response = await request(app).get('/v1/models');

    expect(response.status).toBe(401);
    expect(response.body.error?.type).toBe('authentication_required');
  });

  it('allows authenticated access to protected routes', async () => {
    const server = createProxyServer();
    const app = getAppFromServer(server);

    const response = await request(app)
      .get('/v1/models')
      .set('Authorization', `Bearer ${validApiKey}`);

    expect(response.status).toBe(200);
    expect(response.body.object).toBe('list');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('configures completions handlers for Claude, chat, and messages routes', () => {
    createProxyServer();

    expect(completionsHandlerFactory).toHaveBeenCalledTimes(3);
    for (const call of completionsHandlerFactory.mock.calls) {
      const configArg = call[0];
      expect(configArg).toMatchObject({
        proxyApiKey: testServerConfig.proxyApiKey,
        azureOpenAI: expect.objectContaining({ model: testServerConfig.azureOpenAI?.model }),
      });
    }
  });

  it('starts and stops the HTTP server cleanly', async () => {
    const server = createProxyServer();
    const app = getAppFromServer(server);
    const mockHttpServer = {
      on: vi.fn(),
      close: vi.fn((callback: () => void) => {
        callback();
        return undefined;
      }),
    } as unknown as import('http').Server;

    const listenSpy = vi
      .spyOn(app, 'listen')
      .mockImplementation(((_port: number, _host: string, callback: () => void) => {
        // Call callback asynchronously to simulate real server behavior
        setTimeout(callback, 10);
        return mockHttpServer;
      }) as unknown as typeof app.listen);

    await Promise.race([
      server.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Server start timeout')), 5000))
    ]);
    expect(listenSpy).toHaveBeenCalled();
    
    await Promise.race([
      server.stop(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Server stop timeout')), 5000))
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockHttpServer.close).toHaveBeenCalled();

    listenSpy.mockRestore();
  }, 10000);

  it('registers graceful shutdown handlers with the process', () => {
    const server = createProxyServer();
    const registeredHandlers: Record<string | symbol, (...args: unknown[]) => unknown> = {};
    const onSpy = vi.spyOn(process, 'on').mockImplementation(
      ((event: NodeJS.Signals | 'uncaughtException' | 'unhandledRejection', handler: (...args: unknown[]) => unknown) => {
        Object.assign(registeredHandlers, { [event]: handler });
        return process;
      }) as typeof process.on
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit);

    setupGracefulShutdown(server);

    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

    onSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
