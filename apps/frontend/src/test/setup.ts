import { cleanup } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(async () => {
  cleanup();

  // Ensure all timers are restored to prevent hanging
  vi.useRealTimers();

  // Clear all mocks
  vi.clearAllMocks();

  // Wait for any pending microtasks
  await new Promise((resolve) => setImmediate(resolve));

  // Force garbage collection if available (requires --expose-gc flag)
  if (global.gc) {
    global.gc();
  }
});

// Extend expect with custom matchers
expect.extend({
  toBeInTheDocument(received: Element | null) {
    const pass = received !== null && document.body.contains(received);
    return {
      message: () =>
        `expected element ${pass ? 'not ' : ''}to be in the document`,
      pass,
    };
  },
  toHaveAttribute(received: Element, attribute: string, value?: string) {
    const hasAttribute = received.hasAttribute(attribute);
    const actualValue = received.getAttribute(attribute);
    const pass =
      value !== undefined
        ? hasAttribute && actualValue === value
        : hasAttribute;
    return {
      message: () =>
        `expected element ${pass ? 'not ' : ''}to have attribute ${attribute}${value !== undefined ? ` with value ${value}` : ''}`,
      pass,
    };
  },
  toHaveClass(received: Element, className: string) {
    const pass = received.classList.contains(className);
    return {
      message: () =>
        `expected element ${pass ? 'not ' : ''}to have class ${className}`,
      pass,
    };
  },
  toHaveTextContent(received: Element, text: string | RegExp) {
    const textContent = received.textContent || '';
    const pass =
      typeof text === 'string'
        ? textContent.includes(text)
        : text.test(textContent);
    return {
      message: () =>
        `expected element ${pass ? 'not ' : ''}to have text content matching ${text}`,
      pass,
    };
  },
  toHaveFocus(received: Element) {
    const pass = document.activeElement === received;
    return {
      message: () => `expected element ${pass ? 'not ' : ''}to have focus`,
      pass,
    };
  },
  toBeDisabled(received: Element) {
    const pass =
      (received as HTMLInputElement | HTMLButtonElement).disabled ||
      received.hasAttribute('disabled');
    return {
      message: () => `expected element ${pass ? 'not ' : ''}to be disabled`,
      pass,
    };
  },
  toHaveStyle(received: Element, styles: Record<string, string>) {
    const computedStyle = window.getComputedStyle(received);
    const pass = Object.entries(styles).every(([property, value]) => {
      const actualValue = computedStyle.getPropertyValue(property);
      return actualValue === value;
    });
    return {
      message: () =>
        `expected element ${pass ? 'not ' : ''}to have styles ${JSON.stringify(styles)}`,
      pass,
    };
  },
});

// Mock Prism.js and related imports
vi.mock('prismjs', () => ({
  default: {
    highlight: (code: string) => code,
    languages: {
      javascript: {},
      typescript: {},
      python: {},
      java: {},
      cpp: {},
      c: {},
      css: {},
      html: {},
      json: {},
      markdown: {},
    },
  },
}));

vi.mock('prismjs/themes/prism.css', () => ({}));
vi.mock('prismjs/themes/prism-dark.css', () => ({}));
vi.mock('prismjs/components/prism-javascript', () => ({}));
vi.mock('prismjs/components/prism-typescript', () => ({}));
vi.mock('prismjs/components/prism-python', () => ({}));
vi.mock('prismjs/components/prism-java', () => ({}));
vi.mock('prismjs/components/prism-cpp', () => ({}));
vi.mock('prismjs/components/prism-c', () => ({}));
vi.mock('prismjs/components/prism-css', () => ({}));
vi.mock('prismjs/components/prism-json', () => ({}));
vi.mock('prismjs/components/prism-markdown', () => ({}));
vi.mock('prismjs/components/prism-csharp', () => ({}));
vi.mock('prismjs/components/prism-go', () => ({}));
vi.mock('prismjs/components/prism-rust', () => ({}));
vi.mock('prismjs/components/prism-php', () => ({}));
vi.mock('prismjs/components/prism-ruby', () => ({}));
vi.mock('prismjs/components/prism-swift', () => ({}));
vi.mock('prismjs/components/prism-kotlin', () => ({}));
vi.mock('prismjs/components/prism-scala', () => ({}));
vi.mock('prismjs/components/prism-yaml', () => ({}));
vi.mock('prismjs/components/prism-bash', () => ({}));
vi.mock('prismjs/components/prism-sql', () => ({}));

const translationMap: Record<string, string> = {
  'fileUpload.dropZoneLabel': 'File upload area',
  'fileUpload.dragOrClick': 'Drag files here or click to browse',
  'fileUpload.dropFiles': 'Drop files to upload',
  'fileUpload.supportedTypes': 'Supported types: {{types}} (max {{maxSize}})',
  'fileUpload.scanning': 'Scanning files…',
  'fileUpload.uploading': 'Uploading files…',
  'fileUpload.previewFile': 'Preview {{name}}',
  'fileUpload.previewAlt': '{{name}} preview',
  'fileUpload.security.safe': 'Safe',
  'fileUpload.security.threatDetected': 'Threat detected: {{threats}}',
  'fileUpload.uploadSuccess': 'Upload complete',
  'fileUpload.uploadError': 'Upload failed',
  'common.close': 'Close',
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.processing': 'Processing…',
};

const renderTemplate = (
  template: string,
  options?: Record<string, unknown>
): string => {
  if (!options) {
    return template;
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) => {
    const value = options[token];
    return value !== undefined ? String(value) : '';
  });
};

const translate = (key: string, options?: unknown): string => {
  if (typeof options === 'string') {
    return options;
  }

  const template = translationMap[key] ?? key;
  if (options && typeof options === 'object') {
    return renderTemplate(template, options as Record<string, unknown>);
  }
  return template;
};

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    init: vi.fn().mockResolvedValue({}),
    use: vi.fn().mockReturnThis(),
    t: vi.fn((key: string, options?: unknown) => translate(key, options)),
    changeLanguage: vi.fn().mockResolvedValue({}),
    language: 'en',
    languages: ['en', 'zh'],
    isInitialized: true,
    on: vi.fn(),
    off: vi.fn(),
  },
  createInstance: vi.fn(() => ({
    init: vi.fn().mockResolvedValue({}),
    use: vi.fn().mockReturnThis(),
    t: vi.fn((key: string, options?: unknown) => translate(key, options)),
    changeLanguage: vi.fn().mockResolvedValue({}),
    language: 'en',
    languages: ['en', 'zh'],
    isInitialized: true,
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => translate(key, options),
    i18n: {
      language: 'en',
      changeLanguage: vi.fn().mockResolvedValue({}),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

// Mock i18next-browser-languagedetector
vi.mock('i18next-browser-_languagedetector', () => ({
  default: {
    type: 'languageDetector',
    init: vi.fn(),
    detect: vi.fn(() => 'en'),
    cacheUserLanguage: vi.fn(),
  },
}));

// Mock IntersectionObserver
(
  globalThis as unknown as { IntersectionObserver: unknown }
).IntersectionObserver = class IntersectionObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
};

// Mock ResizeObserver
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  class ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  };

// Mock matchMedia (guard for non-browser environments)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: (): void => {},
      removeListener: (): void => {},
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
      dispatchEvent: (): boolean => false,
    }),
  });

  // Mock scrollTo
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: (): void => {},
  });
}

// Mock crypto API with Web Crypto API support
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: (): string =>
      'test-uuid-' + Math.random().toString(36).substr(2, 9),
    getRandomValues: (array: Uint8Array): Uint8Array => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
    subtle: {
      generateKey: async (
        algorithm: unknown,
        extractable: boolean,
        keyUsages: string[]
      ): Promise<CryptoKey> => {
        return {
          type: 'secret',
          extractable,
          algorithm: algorithm as Algorithm,
          usages: keyUsages as KeyUsage[],
        } as CryptoKey;
      },
      encrypt: async (
        algorithm: unknown,
        key: CryptoKey,
        data: BufferSource
      ): Promise<ArrayBuffer> => {
        // Mock encryption: XOR with a simple key for deterministic testing
        // This provides a reversible transformation that simulates encryption
        let buffer: ArrayBuffer;
        if (data instanceof ArrayBuffer) {
          buffer = data;
        } else if (data instanceof Uint8Array) {
          buffer = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          );
        } else {
          // DataView or other BufferSource
          const view = data as DataView;
          buffer = view.buffer.slice(
            view.byteOffset,
            view.byteOffset + view.byteLength
          );
        }

        // Simple XOR transformation for testing (deterministic and reversible)
        const input = new Uint8Array(buffer);
        const output = new Uint8Array(input.length);
        const xorKey = 0x42; // Simple XOR key for testing

        for (let i = 0; i < input.length; i++) {
          output[i] = input[i] ^ xorKey;
        }

        return output.buffer;
      },
      decrypt: async (
        algorithm: unknown,
        key: CryptoKey,
        data: BufferSource
      ): Promise<ArrayBuffer> => {
        // Mock decryption: XOR with the same key (XOR is its own inverse)
        let buffer: ArrayBuffer;
        if (data instanceof ArrayBuffer) {
          buffer = data;
        } else if (data instanceof Uint8Array) {
          buffer = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          );
        } else {
          // DataView or other BufferSource
          const view = data as DataView;
          buffer = view.buffer.slice(
            view.byteOffset,
            view.byteOffset + view.byteLength
          );
        }

        // Same XOR transformation (XOR is reversible)
        const input = new Uint8Array(buffer);
        const output = new Uint8Array(input.length);
        const xorKey = 0x42; // Same XOR key for testing

        for (let i = 0; i < input.length; i++) {
          output[i] = input[i] ^ xorKey;
        }

        return output.buffer;
      },
      importKey: async (
        format: string,
        keyData: BufferSource,
        algorithm: unknown,
        extractable: boolean,
        keyUsages: string[]
      ): Promise<CryptoKey> => {
        return {
          type: 'secret',
          extractable,
          algorithm: algorithm as Algorithm,
          usages: keyUsages as KeyUsage[],
        } as CryptoKey;
      },
      exportKey: async (
        format: string,
        key: CryptoKey
      ): Promise<ArrayBuffer> => {
        return new ArrayBuffer(32); // Mock 256-bit key
      },
      deriveBits: async (
        algorithm: unknown,
        baseKey: CryptoKey,
        length: number
      ): Promise<ArrayBuffer> => {
        return new ArrayBuffer(length / 8);
      },
      deriveKey: async (
        algorithm: unknown,
        baseKey: CryptoKey,
        derivedKeyAlgorithm: unknown,
        extractable: boolean,
        keyUsages: string[]
      ): Promise<CryptoKey> => {
        return {
          type: 'secret',
          extractable,
          algorithm: derivedKeyAlgorithm as Algorithm,
          usages: keyUsages as KeyUsage[],
        } as CryptoKey;
      },
    },
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: (key: string): string | null => {
    return localStorageMock.store[key] ?? null;
  },
  setItem: (key: string, value: string): void => {
    localStorageMock.store[key] = value;
  },
  removeItem: (key: string): void => {
    delete localStorageMock.store[key];
  },
  clear: (): void => {
    localStorageMock.store = {};
  },
  key: (index: number): string | null => {
    const keys = Object.keys(localStorageMock.store);
    return keys[index] ?? null;
  },
  get length(): number {
    return Object.keys(localStorageMock.store).length;
  },
  store: {} as Record<string, string>,
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: (key: string): string | null => {
      return sessionStorageMock.store[key] ?? null;
    },
    setItem: (key: string, value: string): void => {
      sessionStorageMock.store[key] = value;
    },
    removeItem: (key: string): void => {
      delete sessionStorageMock.store[key];
    },
    clear: (): void => {
      sessionStorageMock.store = {};
    },
    key: (index: number): string | null => {
      const keys = Object.keys(sessionStorageMock.store);
      return keys[index] ?? null;
    },
    get length(): number {
      return Object.keys(sessionStorageMock.store).length;
    },
    store: {} as Record<string, string>,
  };

  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
  });
}

// Mock CompressionStream and DecompressionStream for Node.js environment
if (typeof CompressionStream === 'undefined') {
  (globalThis as unknown as { CompressionStream: unknown }).CompressionStream =
    class CompressionStream {
      constructor(format: string) {
        this.format = format;
      }
      format: string;
      readable = new ReadableStream();
      writable = new WritableStream();
    };
}

if (typeof DecompressionStream === 'undefined') {
  (
    globalThis as unknown as { DecompressionStream: unknown }
  ).DecompressionStream = class DecompressionStream {
    constructor(format: string) {
      this.format = format;
    }
    format: string;
    readable = new ReadableStream();
    writable = new WritableStream();
  };
}

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  },
  writable: true,
});
