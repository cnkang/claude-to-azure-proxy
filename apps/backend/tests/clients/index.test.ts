import { it, expect } from 'vitest';

it('exposes client factory exports', async () => {
  const clients = await import('../../src/clients/index.js');
  expect(typeof clients.AzureResponsesClient).toBe('function');
});
