import { it, expect } from 'vitest';

it('exposes monitoring utilities', async () => {
  const monitoring = await import('../../src/monitoring/index.js');
  expect(typeof monitoring.performanceProfiler).toBe('object');
  expect(typeof monitoring.startMemoryLeakDetection).toBe('function');
});
