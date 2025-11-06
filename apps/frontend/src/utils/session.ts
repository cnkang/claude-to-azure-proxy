/**
 * Session Utility Functions
 *
 * Utility functions for session management, validation, and browser fingerprinting.
 *
 * Requirements: 13.2, 13.3, 13.5
 */

/**
 * Extract session ID from conversation ID
 */
export function extractSessionIdFromConversationId(
  conversationId: string
): string | null {
  // Handle the test format: conv_session_1234567890_abc123_def456_1234567890_xyz789
  const match = conversationId.match(
    /^conv_(session_\d+_[a-z0-9]+_[a-z0-9]+)_\d+_[a-z0-9]+$/
  );
  return match ? match[1] : null;
}

/**
 * Validate conversation ID format
 */
export function isValidConversationId(conversationId: string): boolean {
  // Handle the test format: conv_session_123_abc_def_456_xyz
  return /^conv_session_\d+_[a-z0-9]+_[a-z0-9]+_\d+_[a-z0-9]+$/.test(
    conversationId
  );
}

/**
 * Validate session ID format
 */
export function isValidSessionId(sessionId: string): boolean {
  return /^session_\d+_[a-z0-9]+_[a-f0-9]+$/.test(sessionId);
}

/**
 * Generate secure random string
 */
export function generateSecureRandom(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * Simple hash function
 */
export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Browser fingerprint interface
 */
export interface BrowserFingerprint {
  userAgent: string;
  timezone: string;
  language: string;
  platform: string;
  screenResolution: string;
}

/**
 * Compare browser fingerprints for similarity
 */
export function areFingerprintsSimilar(
  fp1: BrowserFingerprint,
  fp2: BrowserFingerprint
): boolean {
  return (
    fp1.userAgent === fp2.userAgent &&
    fp1.timezone === fp2.timezone &&
    fp1.language === fp2.language &&
    fp1.platform === fp2.platform
  );
}

/**
 * Get browser environment information
 */
export function getBrowserEnvironmentInfo(): {
  userAgent: string;
  language: string;
  platform: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
} {
  const screenWidth =
    typeof window.screen !== 'undefined' ? window.screen.width : 0;
  const screenHeight =
    typeof window.screen !== 'undefined' ? window.screen.height : 0;

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenWidth,
    screenHeight,
  };
}
