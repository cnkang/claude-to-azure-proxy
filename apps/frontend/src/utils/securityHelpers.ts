/**
 * Helper functions for security scanning
 * Extracted to reduce cognitive complexity
 */

/**
 * Check if a file extension is in the malicious set
 */
export const isExtensionMalicious = (
  extension: string,
  maliciousExtensions: Set<string>
): boolean => {
  return maliciousExtensions.has(extension);
};

/**
 * Extract file extension from filename
 */
export const extractExtension = (fileName: string): string => {
  return `.${(fileName.split('.').pop() ?? '').toLowerCase()}`;
};

/**
 * Check for hidden executable extensions in filename
 * (e.g., .txt.exe where .exe is hidden)
 */
export const findHiddenExecutableExtensions = (
  fileName: string,
  maliciousExtensions: Set<string>
): string[] => {
  const threats: string[] = [];
  const parts = fileName.toLowerCase().split('.');

  if (parts.length <= 2) {
    return threats;
  }

  // Check middle parts for hidden extensions
  for (let i = 1; i < parts.length - 1; i++) {
    const segment = parts.at(i) ?? '';
    if (/^[a-z0-9]+$/.test(segment)) {
      const hiddenExt = `.${segment}`;
      if (maliciousExtensions.has(hiddenExt)) {
        threats.push(`Hidden executable extension detected: ${hiddenExt}`);
      }
    }
  }

  return threats;
};

/**
 * Try to decode base64 string and check for executable signatures
 */
export const checkBase64ForExecutable = (
  base64String: string,
  checkSignatures: (bytes: Uint8Array) => string[]
): string[] => {
  try {
    const decoded = atob(base64String);
    const decodedBytes = Uint8Array.from(Array.from(decoded), (char) =>
      char.charCodeAt(0)
    );

    return checkSignatures(decodedBytes);
  } catch {
    // Ignore decode errors
    return [];
  }
};

/**
 * Find and check base64 encoded content for threats
 */
export const scanBase64Content = (
  text: string,
  checkSignatures: (bytes: Uint8Array) => string[]
): string[] => {
  const threats: string[] = [];
  const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/g;
  const matches = text.match(base64Pattern);

  if (!matches || matches.length === 0) {
    return threats;
  }

  // Check first 5 matches to avoid performance issues
  for (const match of matches.slice(0, 5)) {
    const embeddedThreats = checkBase64ForExecutable(match, checkSignatures);
    if (embeddedThreats.length > 0) {
      threats.push('Base64 encoded executable detected');
      break;
    }
  }

  return threats;
};

/**
 * Check for embedded ZIP signature
 */
export const hasEmbeddedZip = (
  content: Uint8Array,
  findBytes: (content: Uint8Array, signature: Uint8Array) => number
): boolean => {
  const zipSignature = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  return findBytes(content, zipSignature) !== -1;
};

/**
 * Check for embedded PE (executable) signature
 */
export const hasEmbeddedPE = (
  content: Uint8Array,
  findBytes: (content: Uint8Array, signature: Uint8Array) => number
): boolean => {
  const peSignature = new Uint8Array([0x4d, 0x5a]);
  return findBytes(content, peSignature) !== -1;
};
