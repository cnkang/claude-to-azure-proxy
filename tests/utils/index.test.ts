import { describe, it, expect } from 'vitest';

it('re-exports core transform utilities', async () => {
  const utils = await import('../../src/utils/index.js');
  expect(typeof utils.transformRequest).toBe('function');
  expect(typeof utils.createClaudeToResponsesTransformer).toBe('function');
  expect(typeof utils.createResponsesStreamingHandler).toBe('function');
});
