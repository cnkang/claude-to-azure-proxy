import { describe, expect, it, vi, afterEach } from 'vitest';
import type { LogEntry } from '../utils/logger.js';

describe('frontendLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits console output for all levels in development mode', async () => {
    vi.stubEnv('DEV', 'true');
    vi.resetModules();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { frontendLogger } = await import('../utils/logger.js');

    frontendLogger.debug('debug message', { debug: true });
    frontendLogger.info('info message', { info: true });
    frontendLogger.warn('warn message', { warn: true });
    frontendLogger.error('error message', { metadata: { error: true } });

    expect(logSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('suppresses debug logs and forwards errors in production mode', async () => {
    vi.stubEnv('DEV', '');
    vi.resetModules();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { frontendLogger } = await import('../utils/logger.js');
    const sendSpy = vi
      .spyOn(
        frontendLogger as unknown as {
          sendToErrorService: (entry: unknown) => void;
        },
        'sendToErrorService'
      )
      .mockImplementation(() => {});

    frontendLogger.debug('debug message'); // Should be suppressed
    expect(logSpy).not.toHaveBeenCalled();

    const error = new Error('failure');
    frontendLogger.error('failed', { error });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'failed',
        error,
      })
    );
  });

  it('falls back to console.log for unknown levels and runs error service handler safely', async () => {
    vi.stubEnv('DEV', 'true');
    vi.resetModules();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { frontendLogger } = await import('../utils/logger.js');
    const internal = frontendLogger as unknown as {
      log: (
        level: string,
        message: string,
        metadata?: Record<string, unknown>,
        error?: Error
      ) => void;
    };

    internal.log('notice' as unknown as LogEntry['level'], 'fallback message');
    expect(logSpy).toHaveBeenCalled();

    vi.stubEnv('DEV', '');
    vi.resetModules();

    const { frontendLogger: prodLogger } = await import('../utils/logger.js');
    const prodInternal = prodLogger as unknown as {
      sendToErrorService: (entry: unknown) => void;
    };
    const sendSpy = vi.spyOn(prodInternal, 'sendToErrorService');
    const prodError = new Error('tracker');

    expect(() =>
      prodLogger.error('prod failure', { error: prodError })
    ).not.toThrow();
    expect(sendSpy).toHaveBeenCalled();
  });
});
