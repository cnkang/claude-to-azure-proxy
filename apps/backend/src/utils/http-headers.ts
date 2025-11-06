import type { IncomingHttpHeaders } from 'http';

// Define a proper readonly version of IncomingHttpHeaders
interface ReadonlyIncomingHttpHeaders {
  readonly [key: string]: readonly string[] | string | undefined;
}

/**
 * Normalize a header value into a single string when possible.
 * Returns undefined when the header is not present or cannot be represented as a string.
 */
export function normalizeHeaderValue(
  value: Readonly<string | readonly string[] | undefined>
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'string'
  ) {
    return value[0];
  }

  return undefined;
}

/**
 * Safely retrieve a normalized header string value from an IncomingHttpHeaders object.
 */
export function getHeaderValue(
  headers: ReadonlyIncomingHttpHeaders,
  name: string
): string | undefined {
  const headerValue = headers[name as keyof IncomingHttpHeaders];
  return normalizeHeaderValue(headerValue);
}
