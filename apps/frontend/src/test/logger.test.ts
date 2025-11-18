import { describe, expect, it, vi, afterEach } from 'vitest';

describe('logger', () => {
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

    const { logger } = await import('../utils/logger.js');

    logger.log('log message', { log: true });
    logger.info('info message', { info: true });
    logger.warn('warn message', { warn: true });
    logger.error('error message', { error: true });

    expect(logSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('suppresses logs in production mode', async () => {
    vi.stubEnv('DEV', '');
    vi.resetModules();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { logger } = await import('../utils/logger.js');

    logger.log('log message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // In production, logs should be suppressed
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('provides frontendLogger alias for backward compatibility', async () => {
    const { logger, frontendLogger } = await import('../utils/logger.js');
    
    expect(frontendLogger).toBe(logger);
  });
});
