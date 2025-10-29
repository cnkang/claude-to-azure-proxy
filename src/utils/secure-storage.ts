/**
 * Secure credential storage and management
 * Provides secure handling of API keys and sensitive configuration
 */

import { createHash, timingSafeEqual } from 'crypto';
import { logger } from '../middleware/logging.js';
import config from '../config/index.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Secure credential manager
 */
export class SecureCredentialManager {
  private static instance: SecureCredentialManager | undefined;
  private readonly credentialHashes: Map<string, string> = new Map();
  private readonly credentialMetadata: Map<string, CredentialMetadata> =
    new Map();

  private constructor() {
    this.initializeCredentials();
  }

  public static getInstance(): SecureCredentialManager {
    SecureCredentialManager.instance ??= new SecureCredentialManager();
    return SecureCredentialManager.instance;
  }

  /**
   * Initialize credential hashes for secure comparison
   */
  private initializeCredentials(): void {
    try {
      // Hash the proxy API key for secure storage
      const proxyKeyHash = this.hashCredential(config.PROXY_API_KEY);
      this.credentialHashes.set('proxy_api_key', proxyKeyHash);
      this.credentialMetadata.set('proxy_api_key', {
        name: 'Proxy API Key',
        type: 'api_key',
        createdAt: new Date(),
        lastUsed: undefined,
        usageCount: 0,
      });

      // Hash the Azure OpenAI API key for secure storage
      const azureKeyHash = this.hashCredential(config.AZURE_OPENAI_API_KEY);
      this.credentialHashes.set('azure_openai_key', azureKeyHash);
      this.credentialMetadata.set('azure_openai_key', {
        name: 'Azure OpenAI API Key',
        type: 'api_key',
        createdAt: new Date(),
        lastUsed: undefined,
        usageCount: 0,
      });

      logger.info('Secure credential manager initialized', '', {
        credentialCount: this.credentialHashes.size,
      });
    } catch (error) {
      logger.error('Failed to initialize secure credential manager', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ConfigurationError(
        'Credential manager initialization failed',
        'secure-storage-init',
        'secure_storage_initialization'
      );
    }
  }

  /**
   * Validate proxy API key with timing-safe comparison
   */
  public validateProxyApiKey(
    providedKey: string,
    correlationId: string
  ): boolean {
    return this.validateCredential('proxy_api_key', providedKey, correlationId);
  }

  /**
   * Get Azure OpenAI API key (for internal use only)
   */
  public getAzureOpenAIApiKey(): string {
    // This should only be used internally and never logged or exposed
    return config.AZURE_OPENAI_API_KEY;
  }

  /**
   * Validate credential with timing-safe comparison
   */
  private validateCredential(
    credentialId: string,
    providedCredential: string,
    correlationId: string
  ): boolean {
    try {
      const storedHash = this.credentialHashes.get(credentialId);
      if (storedHash === undefined) {
        logger.warn(
          'Credential validation failed - unknown credential ID',
          correlationId,
          {
            credentialId,
          }
        );
        return false;
      }

      const providedHash = this.hashCredential(providedCredential);
      const isValid = this.timingSafeCompare(providedHash, storedHash);

      // Update metadata
      const metadata = this.credentialMetadata.get(credentialId);
      if (metadata) {
        metadata.lastUsed = new Date();
        metadata.usageCount++;
      }

      // Log validation attempt (without exposing sensitive data)
      logger.debug('Credential validation attempt', correlationId, {
        credentialId,
        valid: isValid,
        credentialLength: providedCredential.length,
      });

      return isValid;
    } catch (error) {
      logger.error('Credential validation error', correlationId, {
        credentialId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Hash credential for secure storage
   */
  private hashCredential(credential: string): string {
    return createHash('sha256').update(credential).digest('hex');
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeCompare(a: string, b: string): boolean {
    try {
      if (a.length !== b.length) {
        // Perform dummy comparison to prevent timing attacks
        const dummyBuffer = Buffer.alloc(b.length);
        timingSafeEqual(dummyBuffer, Buffer.from(b));
        return false;
      }

      return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch (error) {
      logger.error('Timing-safe comparison error', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get credential metadata (for monitoring)
   */
  public getCredentialMetadata(
    credentialId: string
  ): CredentialMetadata | undefined {
    return this.credentialMetadata.get(credentialId);
  }

  /**
   * Get all credential metadata (for monitoring)
   */
  public getAllCredentialMetadata(): Record<string, CredentialMetadata> {
    const metadata: Record<string, CredentialMetadata> = {};

    for (const [id, data] of this.credentialMetadata) {
      // Use Object.assign to safely set property
      Object.assign(metadata, { [id]: { ...data } });
    }

    return metadata;
  }

  /**
   * Sanitize credential for logging
   */
  public static sanitizeCredential(credential: string): string {
    if (credential.length <= 8) {
      return '[REDACTED]';
    }

    return `${credential.substring(0, 4)}...[REDACTED]...${credential.substring(credential.length - 4)}`;
  }

  /**
   * Check if credential appears to be valid format
   */
  public static isValidCredentialFormat(credential: string): boolean {
    // Basic format validation
    if (credential.length < 16 || credential.length > 256) {
      return false;
    }

    // Check for reasonable character set (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(credential)) {
      return false;
    }

    // Check for obvious test/dummy values
    const dummyPatterns = [
      /^test/i,
      /^dummy/i,
      /^fake/i,
      /^example/i,
      /^placeholder/i,
      /^your[_-]?key/i,
      /^api[_-]?key/i,
      /^secret/i,
      /^password/i,
    ];

    if (dummyPatterns.some((pattern) => pattern.test(credential))) {
      return false;
    }

    return true;
  }

  /**
   * Rotate credentials (for future use)
   */
  public rotateCredential(
    credentialId: string,
    newCredential: string
  ): boolean {
    try {
      if (!SecureCredentialManager.isValidCredentialFormat(newCredential)) {
        logger.warn('Credential rotation failed - invalid format', '', {
          credentialId,
        });
        return false;
      }

      const newHash = this.hashCredential(newCredential);
      this.credentialHashes.set(credentialId, newHash);

      const metadata = this.credentialMetadata.get(credentialId);
      if (metadata) {
        metadata.createdAt = new Date();
        metadata.lastUsed = undefined;
        metadata.usageCount = 0;
      }

      logger.info('Credential rotated successfully', '', {
        credentialId,
      });

      return true;
    } catch (error) {
      logger.error('Credential rotation failed', '', {
        credentialId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Clear all credentials (for cleanup)
   */
  public clearCredentials(): void {
    this.credentialHashes.clear();
    this.credentialMetadata.clear();
    logger.info('All credentials cleared', '');
  }
}

/**
 * Credential metadata interface
 */
interface CredentialMetadata {
  readonly name: string;
  readonly type: 'api_key' | 'token' | 'secret';
  createdAt: Date;
  lastUsed?: Date;
  usageCount: number;
}

/**
 * Secure configuration manager
 */
export class SecureConfigManager {
  private static instance: SecureConfigManager | undefined;
  private readonly sensitiveKeys = new Set([
    'PROXY_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'API_KEY',
    'SECRET',
    'TOKEN',
    'PASSWORD',
    'PRIVATE_KEY',
  ]);

  private constructor() {}

  public static getInstance(): SecureConfigManager {
    SecureConfigManager.instance ??= new SecureConfigManager();
    return SecureConfigManager.instance;
  }

  /**
   * Sanitize configuration for logging
   */
  public sanitizeConfig(
    config: Readonly<Record<string, unknown>>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;

    for (const [key, value] of Object.entries(config)) {
      // Validate key to prevent prototype pollution
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      ) {
        continue;
      }

      if (this.isSensitiveKey(key)) {
        Object.defineProperty(sanitized, key, {
          value: '[REDACTED]',
          enumerable: true,
          configurable: true,
        });
      } else if (typeof value === 'string' && this.looksLikeSecret(value)) {
        Object.defineProperty(sanitized, key, {
          value: '[REDACTED]',
          enumerable: true,
          configurable: true,
        });
      } else {
        Object.defineProperty(sanitized, key, {
          value,
          enumerable: true,
          configurable: true,
        });
      }
    }

    return sanitized;
  }

  /**
   * Check if key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const upperKey = key.toUpperCase();
    return (
      this.sensitiveKeys.has(upperKey) ||
      Array.from(this.sensitiveKeys).some((sensitiveKey) =>
        upperKey.includes(sensitiveKey)
      )
    );
  }

  /**
   * Check if value looks like a secret
   */
  private looksLikeSecret(value: string): boolean {
    // Check length (secrets are usually longer)
    if (value.length < 16) {
      return false;
    }

    // Check for high entropy (mix of characters)
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[^a-zA-Z0-9]/.test(value);

    const entropyScore = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
      Boolean
    ).length;

    return entropyScore >= 3;
  }

  /**
   * Validate environment variables
   */
  public validateEnvironmentSecurity(): {
    secure: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for sensitive data in environment
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        if (
          this.isSensitiveKey(key) &&
          !SecureCredentialManager.isValidCredentialFormat(value)
        ) {
          issues.push(`Environment variable ${key} has invalid format`);
        }

        if (
          value.includes('test') ||
          value.includes('example') ||
          value.includes('placeholder')
        ) {
          issues.push(
            `Environment variable ${key} appears to contain test/placeholder value`
          );
        }
      }
    }

    return {
      secure: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instances
export const secureCredentialManager = SecureCredentialManager.getInstance();
export const secureConfigManager = SecureConfigManager.getInstance();
