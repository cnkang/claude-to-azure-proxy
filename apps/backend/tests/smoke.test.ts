import { describe, expect, it } from 'vitest';

describe('Backend smoke test', () => {
  it('ensures core math operations behave', () => {
    expect(2 * 2).toBe(4);
  });
});
