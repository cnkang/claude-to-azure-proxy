import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { scanFileMock, validateFileMock } = vi.hoisted(() => ({
  scanFileMock: vi.fn(),
  validateFileMock: vi.fn(),
}));

vi.mock('../utils/security.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/security.js')>(
    '../utils/security.js'
  );

  return {
    ...actual,
    SecurityScanner: vi.fn().mockImplementation(function () {
      return {
        scanFile: scanFileMock,
      };
    }),
  };
});

vi.mock('../services/chat', () => ({
  getChatService: vi.fn().mockReturnValue({
    validateFile: validateFileMock,
  }),
}));

import { FileUpload } from '../components/chat/FileUpload.js';
import { TestWrapper } from './test-wrapper.js';

describe('FileUpload component', () => {
  const renderComponent = (props: Partial<React.ComponentProps<typeof FileUpload>> = {}) => {
    const onFilesSelected = vi.fn();
    const onError = vi.fn();

    const result = render(
      <TestWrapper>
        <FileUpload
          acceptedTypes={['.txt', '.md', '.png']}
          maxSize={10 * 1024 * 1024}
          maxFiles={3}
          onFilesSelected={onFilesSelected}
          onError={onError}
          {...props}
        />
      </TestWrapper>
    );

    const input = result.container.querySelector('input[type="file"]') as HTMLInputElement | null;

    if (!input) {
      throw new Error('File input was not rendered');
    }

    return {
      ...result,
      input,
      onFilesSelected,
      onError,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scanFileMock.mockResolvedValue({
      safe: true,
      threats: [],
      confidence: 0.95,
    });
    validateFileMock.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.resetModules();
  });

  const assignFiles = (input: HTMLInputElement, files: File[]): void => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => files,
    });
  };

  it('renders drag-and-drop zone with instructions', () => {
    const { getByRole, getByText } = renderComponent();

    expect(getByRole('button', { name: 'File upload area' })).toBeDefined();
    expect(getByText('Supported types: .txt, .md, .png (max 10 MB)')).toBeDefined();
  });

  it('validates and processes selected files successfully', async () => {
    const file = new File(['console.log("hello")'], 'snippet.ts', {
      type: 'text/plain',
    });
    const { input, onFilesSelected } = renderComponent();

    assignFiles(input, [file]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(validateFileMock).toHaveBeenCalledWith(file, {
        allowedTypes: ['.txt', '.md', '.png'],
        maxSize: 10 * 1024 * 1024,
      });
    });

    await waitFor(() => {
      expect(scanFileMock).toHaveBeenCalledWith(file);
    });

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledTimes(1);
      expect(onFilesSelected).toHaveBeenCalledWith([file]);
    });
  });

  it('reports validation errors from chat service', async () => {
    const invalidFile = new File(['oops'], 'dangerous.exe', {
      type: 'application/octet-stream',
    });

    validateFileMock.mockReturnValueOnce({
      valid: false,
      error: 'Invalid type',
    });

    const { input, onFilesSelected, onError } = renderComponent();

    assignFiles(input, [invalidFile]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Invalid type');
    });

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(scanFileMock).not.toHaveBeenCalled();
  });

  it('prevents processing when disabled', async () => {
    const file = new File(['text'], 'note.txt', { type: 'text/plain' });
    const { input, onFilesSelected } = renderComponent({ disabled: true });

    assignFiles(input, [file]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(onFilesSelected).not.toHaveBeenCalled();
      expect(scanFileMock).not.toHaveBeenCalled();
    });
  });

  it('displays scan errors when threats are detected', async () => {
    const file = new File(['malware'], 'malicious.txt', { type: 'text/plain' });
    scanFileMock.mockResolvedValueOnce({
      safe: false,
      threats: ['Suspicious pattern'],
      confidence: 0.2,
    });

    const { input, getByText, onFilesSelected, onError } = renderComponent();

    assignFiles(input, [file]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(onFilesSelected).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      const uploadItem = getByText(file.name).closest('.upload-item');
      expect(uploadItem).not.toBeNull();
      if (uploadItem) {
        expect(within(uploadItem).getByText('✗')).toBeDefined();
        expect(within(uploadItem).getByText(/Suspicious pattern/)).toBeDefined();
      }
    });
  });

  it('allows opening preview for successfully processed files', async () => {
    const fileContent = Array(20).fill('line').join('\n');
    const file = new File([fileContent], 'log.txt', { type: 'text/plain' });
    const { input, getByRole } = renderComponent({ showPreview: true });

    assignFiles(input, [file]);
    fireEvent.change(input);

    await waitFor(() => {
      expect(scanFileMock).toHaveBeenCalledWith(file);
    });

    const previewButton = await screen.findByRole('button', { name: /preview/i });
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(document.querySelector('.file-preview-modal')).not.toBeNull();
    });
  });

  it('supports drag-and-drop flow', async () => {
    const file = new File(['hello'], 'drop.txt', { type: 'text/plain' });
    const { getByRole } = renderComponent();
    const dropZone = getByRole('button', { name: 'File upload area' });

    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file' }],
      types: ['Files'],
    };

    fireEvent.dragEnter(dropZone, { dataTransfer });
    expect(dropZone.classList.contains('drag-over')).toBe(true);

    fireEvent.drop(dropZone, { dataTransfer });

    await waitFor(() => {
      expect(scanFileMock).toHaveBeenCalledWith(file);
    });
  });
});
