import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';
import { FilePreview } from './FilePreview.js';

vi.mock('../../contexts/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string): string => key,
    formatFileSize: (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`,
  }),
}));

const createTextFile = (contents: string, name: string): File => {
  return new File([contents], name, { type: 'text/plain' });
};

describe('FilePreview component', () => {
  let originalClipboardWrite: ((text: string) => Promise<void>) | undefined;
  let originalFileReader: typeof FileReader;

  beforeAll(() => {
    if (!navigator.clipboard) {
      Object.assign(navigator, {
        clipboard: {
          writeText: async (): Promise<void> => {},
        },
      });
    }
    originalClipboardWrite = navigator.clipboard.writeText.bind(
      navigator.clipboard
    );
    originalFileReader = FileReader;
  });

  beforeEach(() => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalClipboardWrite) {
      (navigator.clipboard.writeText as unknown) = originalClipboardWrite;
    }
    globalThis.FileReader = originalFileReader;
    vi.restoreAllMocks();
  });

  it('renders code preview and allows copying content', async () => {
    const file = createTextFile('console.log("hello");', 'example.ts');
    const onClose = vi.fn();

    render(<FilePreview file={file} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('example.ts')).toBeInstanceOf(HTMLElement);
    });
    fireEvent.click(screen.getByTitle('fileUpload.preview.copyContent'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'console.log("hello");'
    );

    const overlay = screen.getByRole('button', { name: 'common.close' });
    fireEvent.keyDown(overlay, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
  });

  it('displays error state when loading fails and logs the error', async () => {
    const file = createTextFile('error', 'broken.txt');
    const readSpy = vi.spyOn(file, 'text').mockRejectedValue(new Error('boom'));
    const logger = await import('../../utils/logger.js');
    const errorSpy = vi.spyOn(logger.frontendLogger, 'error');

    render(<FilePreview file={file} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('fileUpload.preview.loadError')).toBeInstanceOf(
        HTMLElement
      );
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load file preview content',
      expect.objectContaining({
        metadata: { fileName: 'broken.txt' },
      })
    );
    expect(readSpy).toHaveBeenCalled();
  });

  it('displays formatted metadata for text files', async () => {
    const file = new File(['plain text content'], 'note.txt', {
      type: 'text/plain',
    });
    const onClose = vi.fn();

    render(<FilePreview file={file} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('note.txt')).toBeInstanceOf(HTMLElement);
    });

    expect(screen.getByText(/Bytes|KB|MB|GB/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText('text/plain')).toBeInstanceOf(HTMLElement);
  });

  it('renders image previews and closes when overlay is clicked', async () => {
    const file = new File(['binary'], 'photo.png', { type: 'image/png' });
    const onClose = vi.fn();

    class MockFileReader {
      public onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      public result: string | ArrayBuffer | null = null;

      public readAsDataURL(): void {
        this.result = 'data:image/png;base64,iVBORw0KGgo=';
        this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
      }
    }

    // @ts-expect-error - assign testing mock
    globalThis.FileReader = MockFileReader;

    render(<FilePreview file={file} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'photo.png' })).toBeInstanceOf(
        HTMLImageElement
      );
    });

    // The overlay is the outer div with role="button" and aria-label="common.close"
    // Clicking on it directly (not on child elements) should close
    const overlay = screen.getAllByRole('button', { name: 'common.close' })[0];
    
    // Click on the overlay itself should close
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows unsupported message for unknown files and handles keyboard shortcuts', async () => {
    const file = new File(['???'], 'archive.bin', {
      type: 'application/octet-stream',
    });
    const onClose = vi.fn();

    render(<FilePreview file={file} onClose={onClose} />);

    await waitFor(() => {
      expect(
        screen.getByText('fileUpload.preview.unsupportedType')
      ).toBeInstanceOf(HTMLElement);
    });

    const overlay = screen.getByRole('button', { name: 'common.close' });
    fireEvent.keyDown(overlay, { key: ' ' });
    fireEvent.keyDown(overlay, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('logs clipboard failures when copy action is rejected', async () => {
    const file = createTextFile('copy me', 'script.js');
    const onClose = vi.fn();
    const logger = await import('../../utils/logger.js');
    const errorSpy = vi.spyOn(logger.frontendLogger, 'error');

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );

    render(<FilePreview file={file} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('script.js')).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByTitle('fileUpload.preview.copyContent'));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to copy preview content to clipboard',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });
  });
});
