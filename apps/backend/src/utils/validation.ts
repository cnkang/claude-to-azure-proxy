/**
 * Validation Utilities
 *
 * Common validation functions for request parameters
 */

/**
 * Validate session ID format
 * Accepts both UUID format and frontend-generated session_* format
 */
export const isValidSessionId = (value: string): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Frontend session format: session_timestamp_hash_randomhex
  const sessionPattern = /^session_[0-9]+_[a-z0-9]+_[a-f0-9]+$/i;
  // E2E/test session format: session_e2e_<token>
  const e2eSessionPattern = /^session_e2e_[a-z0-9-]+$/i;

  return (
    uuidPattern.test(value) ||
    sessionPattern.test(value) ||
    e2eSessionPattern.test(value)
  );
};

/**
 * Validate conversation ID format
 * Accepts both UUID format and frontend-generated conv_* format
 */
export const isValidConversationId = (value: string): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Frontend conversation format: conv_uuid
  const convPattern =
    /^conv_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // E2E/test-generated format: test-<timestamp>-<random>
  const testPattern = /^test-[a-z0-9-]+$/i;

  return (
    uuidPattern.test(value) ||
    convPattern.test(value) ||
    testPattern.test(value)
  );
};

/**
 * Validate message ID format
 * Accepts both UUID format and frontend-generated msg_* format
 */
export const isValidMessageId = (value: string): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Frontend message format: msg_uuid
  const msgPattern =
    /^msg_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) || msgPattern.test(value);
};

/**
 * Validate connection ID format (UUID only)
 */
export const isValidConnectionId = (value: string): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
};
