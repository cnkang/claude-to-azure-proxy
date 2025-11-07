import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  SecurityScanner,
  sanitizeFileName,
  validateMimeType,
} from '../utils/security.js';

vi.mock('../utils/logger.js', () => ({
  frontendLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Security utilities integration', () => {
  let originalFileReader: typeof FileReader;

  beforeEach(() => {
    originalFileReader = window.FileReader;

    class MockFileReader {
      public result: ArrayBuffer | null = null;
      public onload:
        | ((this: FileReader, ev: ProgressEvent<FileReader>) => void)
        | null = null;
      public onerror:
        | ((this: FileReader, ev: ProgressEvent<FileReader>) => void)
        | null = null;

      public readAsArrayBuffer(blob: Blob): void {
        blob
          .arrayBuffer()
          .then((buffer) => {
            this.result = buffer;
            if (typeof this.onload === 'function') {
              this.onload.call(
                this as unknown as FileReader,
                {} as ProgressEvent<FileReader>
              );
            }
          })
          .catch((error) => {
            if (typeof this.onerror === 'function') {
              this.onerror.call(
                this as unknown as FileReader,
                error as ProgressEvent<FileReader>
              );
            }
          });
      }
    }

    // @ts-expect-error - happy-dom allows overriding FileReader for tests
    window.FileReader = MockFileReader;
  });

  afterEach(() => {
    window.FileReader = originalFileReader;
  });

  it('sanitizes file names to mitigate traversal and invalid characters', () => {
    const sanitized = sanitizeFileName('../..\\system32\\config?.json');
    expect(sanitized.includes('..')).toBe(false);
    expect(/[<>:"|?*]/.test(sanitized)).toBe(false);
    expect(sanitized.startsWith('.')).toBe(false);
    expect(sanitized.length).toBeLessThanOrEqual(255);
  });

  it('validates MIME types for known extensions', () => {
    const textFile = new File(['content'], 'notes.md', {
      type: 'text/markdown',
    });
    const binaryFile = new File(['content'], 'notes.md', {
      type: 'application/octet-stream',
    });

    expect(validateMimeType(textFile)).toBe(true);
    expect(validateMimeType(binaryFile)).toBe(false);
  });

  it('flags dangerous executable files during scanning', async () => {
    const scanner = new SecurityScanner();
    const executable = new File([new Uint8Array([0x4d, 0x5a])], 'payload.exe', {
      type: 'application/x-msdownload',
    });

    const result = await scanner.scanFile(executable);
    expect(result.safe).toBe(false);
    expect(result.threats).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dangerous file extension'),
        expect.stringContaining('Executable file signature'),
      ])
    );
    expect(result.confidence).toBeLessThan(1);
  });

  it('detects suspicious file names and embedded archives', async () => {
    const scanner = new SecurityScanner();
    const zipSignature = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const payload = new File([zipSignature], '../../AutoExec.BAT', {
      type: 'application/zip',
    });

    const result = await scanner.scanFile(payload);
    expect(result.safe).toBe(false);
    expect(result.threats).toEqual(
      expect.arrayContaining([
        expect.stringContaining('path traversal'),
        expect.stringContaining('system file'),
        expect.stringContaining('dangerous file extension'),
        expect.stringContaining('Embedded ZIP'),
      ])
    );
  });

  it('returns safe result if scan fails unexpectedly', async () => {
    class FailingReader {
      public onload: FileReader['onload'] = null;
      public onerror: FileReader['onerror'] = null;
      public readAsArrayBuffer(): void {
        if (typeof this.onerror === 'function') {
          this.onerror.call(
            this as unknown as FileReader,
            new Event('error') as ProgressEvent<FileReader>
          );
        }
      }
    }

    // @ts-expect-error - happy-dom allows overriding FileReader for tests
    window.FileReader = FailingReader;

    const scanner = new SecurityScanner();
    const benign = new File(['hello'], 'document.txt', { type: 'text/plain' });
    const result = await scanner.scanFile(benign);

    expect(result.safe).toBe(true);
    expect(result.threats).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });
});
