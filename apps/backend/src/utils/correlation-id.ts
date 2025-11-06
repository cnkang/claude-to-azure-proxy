/**
 * Utility helpers for working with correlation IDs across middleware layers.
 * Ensures consistent sanitization and fallback behaviour.
 */

const UNKNOWN_CORRELATION_ID = 'unknown';

export type CorrelationIdGenerator = () => string;

/**
 * Resolve a usable correlation ID from an optional candidate value.
 *
 * @param candidate - Potential correlation ID provided by upstream middleware or clients.
 * @param generator - Optional fallback generator (e.g., uuidv4) when candidate is missing/invalid.
 * @returns Sanitized correlation ID, or 'unknown' when no usable value is available.
 */
export function resolveCorrelationId(
  candidate?: string,
  generator?: CorrelationIdGenerator
): string {
  const sanitizedCandidate = sanitizeCandidate(candidate);
  if (sanitizedCandidate !== undefined) {
    return sanitizedCandidate;
  }

  if (typeof generator === 'function') {
    const generated = sanitizeCandidate(generator());
    if (generated !== undefined) {
      return generated;
    }
  }

  return UNKNOWN_CORRELATION_ID;
}

const sanitizeCandidate = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  // Correlation IDs should be reasonably bounded to prevent log abuse.
  if (trimmed.length > 128) {
    return trimmed.slice(0, 128);
  }

  return trimmed;
};
