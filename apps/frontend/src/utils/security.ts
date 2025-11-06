/**
 * Security Scanner Utility
 *
 * Provides client-side security scanning for uploaded files to detect
 * potential threats and malicious content.
 *
 * Requirements: 4.4
 */

import { frontendLogger } from './logger.js';

export interface SecurityScanResult {
  readonly safe: boolean;
  readonly threats: string[];
  readonly confidence: number;
}

const TEXT_EXTENSIONS_ALLOW_EMPTY = new Set<string>([
  '.txt',
  '.md',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
]);

const MIME_TYPE_MAP = new Map<string, readonly string[]>([
  ['.txt', ['text/plain']],
  ['.md', ['text/markdown', 'text/plain']],
  ['.js', ['text/javascript', 'application/javascript']],
  ['.ts', ['text/typescript', 'application/typescript', 'text/plain']],
  ['.py', ['text/x-python', 'application/x-python-code', 'text/plain']],
  ['.java', ['text/x-java-source', 'text/plain']],
  ['.cpp', ['text/x-c++src', 'text/plain']],
  ['.c', ['text/x-csrc', 'text/plain']],
  ['.h', ['text/x-chdr', 'text/plain']],
  ['.css', ['text/css']],
  ['.html', ['text/html']],
  ['.json', ['application/json', 'text/json']],
  ['.xml', ['application/xml', 'text/xml']],
  ['.csv', ['text/csv']],
  ['.png', ['image/png']],
  ['.jpg', ['image/jpeg']],
  ['.jpeg', ['image/jpeg']],
  ['.gif', ['image/gif']],
  ['.webp', ['image/webp']],
  ['.svg', ['image/svg+xml']],
]);

const SYSTEM_FILE_INDICATORS = new Set([
  'autoexec.bat',
  'config.sys',
  'boot.ini',
  'ntldr',
  'bootmgr',
  'system32',
  'windir',
  'temp',
  'windows',
  'program files',
]);

/**
 * Security scanner for file validation
 */
export class SecurityScanner {
  private readonly maxScanSize = 1024 * 1024; // 1MB max scan size
  private readonly suspiciousPatterns: RegExp[];
  private readonly maliciousExtensions: Set<string>;
  private readonly executableSignatures: Uint8Array[];

  constructor() {
    // Initialize suspicious patterns
    this.suspiciousPatterns = [
      // Script injection patterns
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,

      // SQL injection patterns
      /union\s+select/gi,
      /drop\s+table/gi,
      /delete\s+from/gi,
      /insert\s+into/gi,

      // Command injection patterns
      /\|\s*nc\s/gi,
      /\|\s*netcat/gi,
      /\|\s*wget/gi,
      /\|\s*curl/gi,
      /\$\(.*\)/gi,
      /`.*`/gi,

      // Suspicious URLs
      /https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/gi,
      /bit\.ly|tinyurl|t\.co/gi,

      // Encoded content that might hide malicious code
      /eval\s*\(/gi,
      /base64/gi,
      /atob\s*\(/gi,
      /fromCharCode/gi,
    ];

    // Known malicious file extensions
    this.maliciousExtensions = new Set([
      '.exe',
      '.bat',
      '.cmd',
      '.com',
      '.pif',
      '.scr',
      '.vbs',
      '.vbe',
      '.js',
      '.jse',
      '.jar',
      '.msi',
      '.dll',
      '.app',
      '.deb',
      '.rpm',
      '.dmg',
      '.pkg',
      '.run',
      '.bin',
      '.sh',
      '.ps1',
      '.psm1',
    ]);

    // Common executable file signatures (magic numbers)
    this.executableSignatures = [
      new Uint8Array([0x4d, 0x5a]), // PE executable (MZ)
      new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), // ELF executable
      new Uint8Array([0xfe, 0xed, 0xfa, 0xce]), // Mach-O executable (32-bit)
      new Uint8Array([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O executable (64-bit)
      new Uint8Array([0xca, 0xfe, 0xba, 0xbe]), // Java class file
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // ZIP/JAR file
    ];
  }

  /**
   * Scan file for security threats
   */
  public async scanFile(file: File): Promise<SecurityScanResult> {
    const threats: string[] = [];
    let confidence = 1.0;

    try {
      // Check file extension
      const extensionThreats = this.checkFileExtension(file.name);
      threats.push(...extensionThreats);

      // Check file size (very large files might be suspicious)
      if (file.size > 100 * 1024 * 1024) {
        // 100MB
        threats.push('Unusually large file size');
        confidence *= 0.8;
      }

      // Check file name for suspicious patterns
      const nameThreats = this.checkFileName(file.name);
      threats.push(...nameThreats);

      // Read file content for analysis (limited size)
      const content = await this.readFileContent(file);

      if (content !== null) {
        // Check for executable signatures
        const signatureThreats = this.checkExecutableSignatures(content);
        threats.push(...signatureThreats);

        // Check for suspicious patterns in content
        const contentThreats = this.checkSuspiciousPatterns(content);
        threats.push(...contentThreats);

        // Check for embedded files or archives
        const embeddedThreats = this.checkEmbeddedContent(content);
        threats.push(...embeddedThreats);
      }

      // Calculate final confidence based on threat count
      if (threats.length > 0) {
        confidence = Math.max(0.1, confidence - threats.length * 0.2);
      }

      return {
        safe: threats.length === 0,
        threats,
        confidence,
      };
    } catch (_error: unknown) {
      const normalizedError =
        _error instanceof Error ? _error : new Error(String(_error));
      frontendLogger.warn('Security scan failed', {
        metadata: {
          fileName: file.name,
          error: normalizedError.message,
        },
        error: normalizedError,
      });
      return {
        safe: true, // Default to safe if scan fails
        threats: [],
        confidence: 0,
      };
    }
  }

  /**
   * Check file extension for known malicious types
   */
  private checkFileExtension(fileName: string): string[] {
    const threats: string[] = [];
    const extension = '.' + (fileName.split('.').pop() ?? '').toLowerCase();

    if (this.maliciousExtensions.has(extension)) {
      threats.push(`Potentially dangerous file extension: ${extension}`);
    }

    // Check for double extensions (e.g., .txt.exe)
    const parts = fileName.toLowerCase().split('.');
    if (parts.length > 2) {
      for (let i = 1; i < parts.length - 1; i++) {
        const segment = parts.at(i) ?? '';
        if (/^[a-z0-9]+$/.test(segment)) {
          const hiddenExt = `.${segment}`;
          if (this.maliciousExtensions.has(hiddenExt)) {
            threats.push(`Hidden executable extension detected: ${hiddenExt}`);
          }
        }
      }
    }

    return threats;
  }

  /**
   * Check file name for suspicious patterns
   */
  private checkFileName(fileName: string): string[] {
    const threats: string[] = [];

    // Check for suspicious characters
    if (/[<>:"|?*]/.test(fileName)) {
      threats.push('File name contains suspicious characters');
    }

    // Check for path traversal attempts
    if (
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\')
    ) {
      threats.push('File name contains path traversal patterns');
    }

    const lowerFileName = fileName.toLowerCase();
    for (const indicator of SYSTEM_FILE_INDICATORS) {
      if (lowerFileName.includes(indicator)) {
        threats.push('File name resembles system file');
        break;
      }
    }

    return threats;
  }

  /**
   * Read file content for analysis (limited size)
   */
  private async readFileContent(file: File): Promise<Uint8Array | null> {
    if (file.size === 0) {
      return null;
    }

    const sizeToRead = Math.min(file.size, this.maxScanSize);
    const blob = file.slice(0, sizeToRead);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (): void => {
        const arrayBuffer = reader.result as ArrayBuffer;
        resolve(new Uint8Array(arrayBuffer));
      };

      reader.onerror = (): void => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Check for executable file signatures
   */
  private checkExecutableSignatures(content: Uint8Array): string[] {
    const threats: string[] = [];

    for (const signature of this.executableSignatures) {
      if (this.bytesMatch(content, signature, 0)) {
        threats.push(
          `Executable file signature detected: ${this.bytesToHex(signature)}`
        );
      }
    }

    return threats;
  }

  /**
   * Check content for suspicious patterns
   */
  private checkSuspiciousPatterns(content: Uint8Array): string[] {
    const threats: string[] = [];

    try {
      // Convert to text for pattern matching (handle encoding issues gracefully)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(content);

      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(text)) {
          threats.push(`Suspicious pattern detected: ${pattern.source}`);
        }
      }

      // Check for high entropy (might indicate encrypted/obfuscated content)
      const entropy = this.calculateEntropy(text);
      if (entropy > 7.5) {
        // High entropy threshold
        threats.push('High entropy content detected (possible obfuscation)');
      }
    } catch {
      // If text decoding fails, it might be binary content
      threats.push('Binary content detected in text file');
    }

    return threats;
  }

  /**
   * Check for embedded content or archives
   */
  private checkEmbeddedContent(content: Uint8Array): string[] {
    const threats: string[] = [];

    // Check for embedded ZIP files
    const zipSignature = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    if (this.findBytes(content, zipSignature) !== -1) {
      threats.push('Embedded ZIP archive detected');
    }

    // Check for embedded PE files
    const peSignature = new Uint8Array([0x4d, 0x5a]);
    if (this.findBytes(content, peSignature) !== -1) {
      threats.push('Embedded executable detected');
    }

    // Check for base64 encoded content (might hide malicious payload)
    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(content);
      const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/g;
      const matches = text.match(base64Pattern);

      if (matches && matches.length > 0) {
        // Try to decode and check if it contains executable signatures
        for (const match of matches.slice(0, 5)) {
          // Limit checks
          try {
            const decoded = atob(match);
            const decodedBytes = Uint8Array.from(Array.from(decoded), (char) =>
              char.charCodeAt(0)
            );

            const embeddedThreats =
              this.checkExecutableSignatures(decodedBytes);
            if (embeddedThreats.length > 0) {
              threats.push('Base64 encoded executable detected');
              break;
            }
          } catch {
            // Ignore decode errors
          }
        }
      }
    } catch {
      // Ignore text decoding errors
    }

    return threats;
  }

  /**
   * Calculate Shannon entropy of text
   */
  private calculateEntropy(text: string): number {
    const frequencies = new Map<string, number>();

    for (const char of text) {
      const count = frequencies.get(char) ?? 0;
      frequencies.set(char, count + 1);
    }

    let entropy = 0;
    const length = text.length;

    for (const count of frequencies.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Check if bytes match at specific position
   */
  private bytesMatch(
    content: Uint8Array,
    signature: Uint8Array,
    offset: number
  ): boolean {
    const segment = content.subarray(offset, offset + signature.length);
    if (segment.length !== signature.length) {
      return false;
    }

    return this.bytesToHex(segment) === this.bytesToHex(signature);
  }

  /**
   * Find bytes in content
   */
  private findBytes(content: Uint8Array, signature: Uint8Array): number {
    for (let i = 0; i <= content.length - signature.length; i++) {
      if (this.bytesMatch(content, signature, i)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Convert bytes to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ');
  }
}

/**
 * Validate file MIME type against extension
 */
export function validateMimeType(file: File): boolean {
  const extension = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
  const mimeType = file.type.toLowerCase();

  const expectedMimes = MIME_TYPE_MAP.get(extension);
  if (!expectedMimes) {
    return false;
  }

  if (mimeType.length === 0 && TEXT_EXTENSIONS_ALLOW_EMPTY.has(extension)) {
    return true;
  }

  return expectedMimes.some((expected) => expected === mimeType);
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"|?*]/g, '_') // Replace invalid characters
    .replace(/\.\./g, '_') // Remove path traversal
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
}
