import { describe, it, expect } from 'vitest';
import {
  normalizeHeaderValue,
  getHeaderValue,
} from '../../src/utils/http-headers';

describe('HTTP header utilities', () => {
  it('normalizes string and array values consistently', () => {
    expect(normalizeHeaderValue('text/plain')).toBe('text/plain');
    expect(normalizeHeaderValue(['application/json'])).toBe('application/json');
    expect(normalizeHeaderValue([])).toBeUndefined();
    expect(normalizeHeaderValue(undefined)).toBeUndefined();
  });

  it('extracts header values from IncomingHttpHeaders', () => {
    const headers = {
      accept: ['application/json', 'text/plain'],
      host: 'localhost:8080',
    } as const;

    expect(getHeaderValue(headers, 'accept')).toBe('application/json');
    expect(getHeaderValue(headers, 'host')).toBe('localhost:8080');
    expect(getHeaderValue(headers, 'authorization')).toBeUndefined();
  });
});
