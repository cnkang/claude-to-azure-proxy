import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  secureCredentialManager,
  secureConfigManager,
  SecureCredentialManager,
} from '../src/utils/secure-storage.js';
import { validApiKey } from './test-config.js';

vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const reinitializeCredentials = (): void => {
  secureCredentialManager.clearCredentials();
  (secureCredentialManager as unknown as { initializeCredentials: () => void }).initializeCredentials();
};

describe('Secure credential storage', () => {
  beforeEach(() => {
    reinitializeCredentials();
  });

  it('validates proxy API keys using timing-safe comparison', () => {
    const isValid = secureCredentialManager.validateProxyApiKey(validApiKey, 'secure-storage-test');
    const metadata = secureCredentialManager.getCredentialMetadata('proxy_api_key');

    expect(isValid).toBe(true);
    expect(metadata?.usageCount).toBe(1);
    expect(metadata?.lastUsed).toBeInstanceOf(Date);
  });

  it('rejects invalid credentials and still tracks attempts', () => {
    const result = secureCredentialManager.validateProxyApiKey('invalid-key-value', 'secure-storage-test');
    const metadata = secureCredentialManager.getCredentialMetadata('proxy_api_key');

    expect(result).toBe(false);
    expect(metadata?.usageCount).toBe(1);
  });

  it('rotates credentials and validates the new secret', () => {
    const newCredential = 'N3wCredentialKeyValue___';
    const rotationResult = secureCredentialManager.rotateCredential('proxy_api_key', newCredential);

    expect(rotationResult).toBe(true);
    const metadata = secureCredentialManager.getCredentialMetadata('proxy_api_key');
    expect(metadata?.usageCount).toBe(0);

    const validationResult = secureCredentialManager.validateProxyApiKey(newCredential, 'rotation-test');
    expect(validationResult).toBe(true);
  });

  it('sanitizes credentials consistently', () => {
    expect(SecureCredentialManager.sanitizeCredential('short')).toBe('[REDACTED]');
    expect(SecureCredentialManager.sanitizeCredential('abcdefghijklmnop')).toBe('abcd...[REDACTED]...mnop');
  });

  it('performs strict credential format validation', () => {
    expect(SecureCredentialManager.isValidCredentialFormat('test-key-123')).toBe(false);
    expect(SecureCredentialManager.isValidCredentialFormat('VALID_KEY_1234567890')).toBe(true);
  });

  it('returns cloned credential metadata objects', () => {
    const metadata = secureCredentialManager.getAllCredentialMetadata();
    const proxyMetadata = metadata.proxy_api_key;
    expect(proxyMetadata).toBeDefined();
    if (proxyMetadata) {
      proxyMetadata.usageCount = 999;
    }

    const original = secureCredentialManager.getCredentialMetadata('proxy_api_key');
    expect(original?.usageCount).not.toBe(999);
  });
});

describe('Secure config manager', () => {
  afterEach(() => {
    delete process.env.DEMO_SECRET;
  });

  it('redacts sensitive configuration values', () => {
    const sanitized = secureConfigManager.sanitizeConfig({
      PROXY_API_KEY: 'super-secret',
      harmless: 'value',
      TOKEN_VALUE: 'another-secret-value',
    });

    expect(sanitized.PROXY_API_KEY).toBe('[REDACTED]');
    expect(sanitized.harmless).toBe('value');
    expect(sanitized.TOKEN_VALUE).toBe('[REDACTED]');
  });

  it('detects insecure environment variable values', () => {
    process.env.DEMO_SECRET = 'test-placeholder-secret';
    const result = secureConfigManager.validateEnvironmentSecurity();

    expect(result.secure).toBe(false);
    expect(result.issues.some((issue) => issue.includes('DEMO_SECRET'))).toBe(true);
  });
});
