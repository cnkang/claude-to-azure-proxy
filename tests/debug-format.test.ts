import { describe, it, vi } from 'vitest';

describe('debug format script', () => {
  it('runs without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../debug-format.js');
    logSpy.mockRestore();
  });
});
