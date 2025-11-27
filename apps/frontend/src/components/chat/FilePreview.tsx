/**
 * File Preview Component
 *
 * Displays file previews for images and code files with syntax highlighting.
 *
 * Requirements: 4.1, 4.3
 */

import React, { memo, useCallback, useState, useEffect } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { frontendLogger } from '../../utils/logger.js';
import { Glass, cn } from '../ui/Glass.js';

interface FilePreviewProps {
  readonly file: File;
  readonly onClose: () => void;
}

/**
 * File preview modal component
 */
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);
const CODE_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
  '.css',
  '.html',
]);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.xml', '.csv']);

const readFileAsDataURL = (targetFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('Failed to read file'));
    };
    reader.readAsDataURL(targetFile);
  });
};

export const FilePreview = memo<FilePreviewProps>(({ file, onClose }) => {
  const { t, formatFileSize } = useI18n();
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getFileExtension = useCallback((): string => {
    const segments = file.name.split('.');
    return segments.length > 1 ? `.${segments.pop()?.toLowerCase() ?? ''}` : '';
  }, [file.name]);

  /**
   * Load file content for preview
   */
  const loadFileContent = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const extension = getFileExtension();

      if (IMAGE_EXTENSIONS.has(extension)) {
        const dataUrl = await readFileAsDataURL(file);
        setContent(dataUrl);
      } else {
        const textContent = await file.text();
        setContent(textContent);
      }
    } catch (readError) {
      setError(t('fileUpload.preview.loadError'));
      frontendLogger.error('Failed to load file preview content', {
        error:
          readError instanceof Error ? readError : new Error(String(readError)),
        metadata: { fileName: file.name },
      });
    } finally {
      setIsLoading(false);
    }
  }, [file, getFileExtension, t]);

  /**
   * Handle escape key to close preview
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Get file type for display
   */
  const getFileType = useCallback((): 'image' | 'code' | 'text' | 'unknown' => {
    const extension = getFileExtension();

    if (IMAGE_EXTENSIONS.has(extension)) {
      return 'image';
    }
    if (CODE_EXTENSIONS.has(extension)) {
      return 'code';
    }
    if (TEXT_EXTENSIONS.has(extension)) {
      return 'text';
    }
    return 'unknown';
  }, [getFileExtension]);

  /**
   * Get syntax highlighting class for code files
   */
  const getSyntaxClass = useCallback((): string => {
    const extension = getFileExtension();

    switch (extension) {
      case '.js':
        return 'language-javascript';
      case '.ts':
        return 'language-typescript';
      case '.py':
        return 'language-python';
      case '.java':
        return 'language-java';
      case '.cpp':
        return 'language-cpp';
      case '.c':
      case '.h':
        return 'language-c';
      case '.css':
        return 'language-css';
      case '.html':
        return 'language-html';
      case '.json':
        return 'language-json';
      case '.xml':
        return 'language-xml';
      case '.md':
        return 'language-markdown';
      default:
        return 'language-text';
    }
  }, [getFileExtension]);

  /**
   * Copy content to clipboard
   */
  const copyToClipboard = useCallback((): void => {
    navigator.clipboard.writeText(content).catch((copyError) => {
      frontendLogger.error('Failed to copy preview content to clipboard', {
        error:
          copyError instanceof Error ? copyError : new Error(String(copyError)),
      });
    });
  }, [content]);

  /**
   * Load content on mount
   */
  useEffect(() => {
    loadFileContent().catch(() => undefined);
  }, [loadFileContent]);

  /**
   * Add escape key listener
   */
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const fileType = getFileType();

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleOverlayKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (
        event.key === 'Escape' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="button"
      tabIndex={0}
      aria-label={t('common.close')}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <Glass className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" intensity="high" border={true}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-md">{file.name}</h3>
            <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span className="font-mono">{formatFileSize(file.size)}</span>
              <span>•</span>
              <span className="uppercase">
                {file.type || t('fileUpload.preview.unknownType')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(fileType === 'code' || fileType === 'text') && (
              <button
                type="button"
                className="p-2 text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                onClick={copyToClipboard}
                title={t('fileUpload.preview.copyContent')}
              >
                📋
              </button>
            )}

            <button
              type="button"
              className="p-2 text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              onClick={onClose}
              title={t('common.close')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-white dark:bg-gray-900 min-h-[300px]">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">{t('fileUpload.preview.loading')}</p>
            </div>
          )}

          {error !== null && (
            <div className="flex flex-col items-center justify-center h-full text-red-700 gap-4">
              <p className="text-lg font-medium">{error}</p>
              <button
                type="button"
                className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg text-sm font-medium transition-colors"
                onClick={() => {
                  loadFileContent().catch(() => undefined);
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {!isLoading && error === null && (
            <>
              {fileType === 'image' && (
                <div className="flex items-center justify-center h-full">
                  <img
                    src={content}
                    alt={file.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              )}

              {(fileType === 'code' || fileType === 'text') && (
                <div className="h-full">
                  <pre className={cn("p-4 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-auto text-sm font-mono h-full", getSyntaxClass())}>
                    <code>{content}</code>
                  </pre>
                </div>
              )}

              {fileType === 'unknown' && (
                <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-4">
                  <div className="text-6xl opacity-50">📄</div>
                  <p className="text-lg font-medium">{t('fileUpload.preview.unsupportedType')}</p>
                  <p className="text-sm text-center max-w-md">
                    {t('fileUpload.preview.fileInfo', {
                      name: file.name,
                      size: formatFileSize(file.size),
                      type: file.type || t('fileUpload.preview.unknownType'),
                    })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Glass>
    </div>
  );
});

FilePreview.displayName = 'FilePreview';
