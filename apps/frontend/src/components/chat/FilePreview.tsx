/**
 * File Preview Component
 *
 * Displays file previews for images and code files with syntax highlighting.
 *
 * Requirements: 4.1, 4.3
 */

import React, { memo, useCallback, useState, useEffect } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { frontendLogger } from '../../utils/logger';
import './FilePreview.css';

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
  const { t } = useI18n();
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
   * Format file size
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const rawIndex = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.min(Math.max(rawIndex, 0), 3);
    const formattedValue = parseFloat((bytes / Math.pow(k, index)).toFixed(2));
    const unit =
      index === 0 ? 'Bytes' : index === 1 ? 'KB' : index === 2 ? 'MB' : 'GB';
    return `${formattedValue} ${unit}`;
  }, []);

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
      className="file-preview-overlay"
      role="button"
      tabIndex={0}
      aria-label={t('common.close')}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div className="file-preview-modal">
        {/* Header */}
        <div className="preview-header">
          <div className="file-info">
            <h3 className="file-name">{file.name}</h3>
            <div className="file-meta">
              <span className="file-size">{formatFileSize(file.size)}</span>
              <span className="file-type">
                {file.type || t('fileUpload.preview.unknownType')}
              </span>
            </div>
          </div>

          <div className="preview-actions">
            {fileType === 'code' || fileType === 'text' ? (
              <button
                type="button"
                className="action-button copy-button"
                onClick={copyToClipboard}
                title={t('fileUpload.preview.copyContent')}
              >
                📋
              </button>
            ) : null}

            <button
              type="button"
              className="action-button close-button"
              onClick={onClose}
              title={t('common.close')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="preview-content">
          {isLoading && (
            <div className="preview-loading">
              <div className="loading-spinner" />
              <p>{t('fileUpload.preview.loading')}</p>
            </div>
          )}

          {error !== null && (
            <div className="preview-error">
              <p>{error}</p>
              <button
                type="button"
                className="retry-button"
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
                <div className="image-preview">
                  <img
                    src={content}
                    alt={file.name}
                    className="preview-image"
                  />
                </div>
              )}

              {(fileType === 'code' || fileType === 'text') && (
                <div className="text-preview">
                  <pre className={`code-content ${getSyntaxClass()}`}>
                    <code>{content}</code>
                  </pre>
                </div>
              )}

              {fileType === 'unknown' && (
                <div className="unsupported-preview">
                  <div className="unsupported-icon">📄</div>
                  <p>{t('fileUpload.preview.unsupportedType')}</p>
                  <p className="file-info-text">
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
      </div>
    </div>
  );
});

FilePreview.displayName = 'FilePreview';
