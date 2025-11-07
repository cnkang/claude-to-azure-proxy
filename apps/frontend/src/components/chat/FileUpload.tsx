/**
 * File Upload Component
 *
 * Secure file upload with drag-and-drop support, file validation,
 * progress indicators, file preview, and security scanning.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { getChatService } from '../../services/chat';
import { FilePreview } from './FilePreview';
import {
  SecurityScanner,
  type SecurityScanResult,
} from '../../utils/security.js';
import { frontendLogger } from '../../utils/logger.js';
import './FileUpload.css';

interface FileUploadProps {
  readonly acceptedTypes: string[];
  readonly maxSize: number;
  readonly maxFiles?: number;
  readonly onFilesSelected: (files: File[]) => void;
  readonly onError: (_error: string) => void;
  readonly disabled?: boolean;
  readonly showPreview?: boolean;
}

interface UploadingFile {
  readonly file: File;
  readonly id: string;
  readonly progress: number;
  readonly status: 'uploading' | 'success' | 'error' | 'scanning';
  readonly error?: string;
  readonly preview?: string;
  readonly securityScan?: SecurityScanResult;
}

const DANGEROUS_FILE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.scr',
  '.pif',
  '.com',
  '.jar',
]);
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

const getFileExtension = (file: File): string => {
  const segments = file.name.split('.');
  return segments.length > 1 ? `.${segments.pop()?.toLowerCase() ?? ''}` : '';
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
};

/**
 * File upload component with drag-and-drop, validation, preview, and security scanning
 */
const FileUploadComponent = ({
  acceptedTypes,
  maxSize,
  maxFiles = 5,
  onFilesSelected,
  onError,
  disabled = false,
  showPreview = true,
}: FileUploadProps): React.JSX.Element => {
  const { t, formatFileSize } = useI18n();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatService = getChatService();
  const dragCounterRef = useRef(0);
  const securityScanner = useRef(new SecurityScanner());
  const updateUploadingFile = useCallback(
    (id: string, updater: (file: UploadingFile) => UploadingFile): void => {
      setUploadingFiles((prev) =>
        prev.map((uploadingFile) =>
          uploadingFile.id === id ? updater(uploadingFile) : uploadingFile
        )
      );
    },
    []
  );

  /**
   * Enhanced file validation with security checks
   */
  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      const basicValidation = chatService.validateFile(file, {
        maxSize,
        allowedTypes: acceptedTypes,
      });

      if (!basicValidation.valid) {
        return basicValidation;
      }

      const extension = getFileExtension(file);

      if (
        file.name.includes('..') ||
        file.name.includes('/') ||
        file.name.includes('\\')
      ) {
        return {
          valid: false,
          error: t('fileUpload.security.suspiciousPath'),
        };
      }

      if (DANGEROUS_FILE_EXTENSIONS.has(extension)) {
        return {
          valid: false,
          error: t('fileUpload.security.executableFile'),
        };
      }

      if (IMAGE_EXTENSIONS.has(extension) && file.size > 5 * 1024 * 1024) {
        return {
          valid: false,
          error: t('fileUpload.security.imageTooLarge'),
        };
      }

      if (CODE_EXTENSIONS.has(extension) && file.size > 1 * 1024 * 1024) {
        return {
          valid: false,
          error: t('fileUpload.security.codeTooLarge'),
        };
      }

      if (TEXT_EXTENSIONS.has(extension) && file.size > 512 * 1024) {
        return {
          valid: false,
          error: t('fileUpload.security.textTooLarge'),
        };
      }

      return { valid: true };
    },
    [chatService, maxSize, acceptedTypes, t]
  );

  /**
   * Generate file preview
   */
  const generatePreview = useCallback(
    async (file: File): Promise<string | undefined> => {
      if (!showPreview) {
        return undefined;
      }

      const extension = getFileExtension(file);

      if (IMAGE_EXTENSIONS.has(extension)) {
        try {
          return await readFileAsDataURL(file);
        } catch {
          return undefined;
        }
      }

      if (CODE_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension)) {
        try {
          const textContent = await file.text();
          const lines = textContent.split('\n');
          const previewText = lines.slice(0, 10).join('\n');
          return lines.length > 10 ? `${previewText}\n...` : previewText;
        } catch {
          return undefined;
        }
      }

      return undefined;
    },
    [showPreview]
  );

  /**
   * Perform security scan on file
   */
  const performSecurityScan = useCallback(
    async (file: File): Promise<SecurityScanResult> => {
      try {
        return await securityScanner.current.scanFile(file);
      } catch (error) {
        frontendLogger.warn('Security scan failed', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { fileName: file.name },
        });
        return {
          safe: true,
          threats: [],
          confidence: 0,
        };
      }
    },
    []
  );

  /**
   * Handle file selection with enhanced processing
   */
  const handleFiles = useCallback(
    async (files: FileList): Promise<void> => {
      if (disabled) {
        return;
      }

      const selectedFiles = Array.from(files);
      if (selectedFiles.length > maxFiles) {
        onError(t('fileUpload.tooManyFiles', { max: maxFiles }));
        return;
      }

      const validationResults = selectedFiles.map((file) => ({
        file,
        result: validateFile(file),
      }));

      const firstInvalid = validationResults.find(
        (validation) => !validation.result.valid
      );
      if (firstInvalid) {
        onError(firstInvalid.result.error ?? t('fileUpload.invalidFile'));
        return;
      }

      const initialUploads: UploadingFile[] = validationResults.map(
        ({ file }) => ({
          file,
          id: crypto.randomUUID(),
          progress: 0,
          status: 'scanning',
        })
      );

      setUploadingFiles(initialUploads);

      const safeFiles: File[] = [];

      try {
        for (const uploading of initialUploads) {
          updateUploadingFile(uploading.id, (uf) => ({
            ...uf,
            progress: 10,
            status: 'scanning',
          }));

          const preview = await generatePreview(uploading.file);
          updateUploadingFile(uploading.id, (uf) => ({
            ...uf,
            progress: 50,
            preview,
          }));

          const securityScan = await performSecurityScan(uploading.file);

          if (!securityScan.safe) {
            updateUploadingFile(uploading.id, (uf) => ({
              ...uf,
              progress: 100,
              status: 'error',
              error: t('fileUpload.security.threatDetected', {
                threats: securityScan.threats.join(', '),
              }),
              securityScan,
            }));
            continue;
          }

          safeFiles.push(uploading.file);
          updateUploadingFile(uploading.id, (uf) => ({
            ...uf,
            progress: 100,
            status: 'success',
            preview,
            securityScan,
          }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t('fileUpload.uploadFailed');
        frontendLogger.error('File upload failed', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
        setUploadingFiles((prev) =>
          prev.map((uf) => ({ ...uf, status: 'error', _error: errorMessage }))
        );
        onError(errorMessage);
        return;
      }

      if (safeFiles.length > 0) {
        onFilesSelected(safeFiles);
      }

      window.setTimeout(() => {
        setUploadingFiles([]);
      }, 3000);
    },
    [
      disabled,
      maxFiles,
      validateFile,
      onError,
      onFilesSelected,
      generatePreview,
      performSecurityScan,
      t,
      updateUploadingFile,
    ]
  );

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current++;
    const itemCount = e.dataTransfer.items.length;
    if (itemCount > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragOver(false);
      dragCounterRef.current = 0;

      if (disabled) {
        return;
      }

      const { files } = e.dataTransfer;
      if (files.length > 0) {
        handleFiles(files).catch((error: unknown) => {
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          frontendLogger.error('Drag-and-drop file handling failed', {
            error: normalizedError,
          });
          onError(normalizedError.message);
        });
      }
    },
    [disabled, handleFiles, onError]
  );

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const { files } = e.target;
      if (files && files.length > 0) {
        handleFiles(files).catch((error: unknown) => {
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          frontendLogger.error('File input handling failed', {
            error: normalizedError,
          });
          onError(normalizedError.message);
        });
      }

      // Clear input value to allow selecting same file again
      e.target.value = '';
    },
    [handleFiles, onError]
  );

  /**
   * Open file dialog
   */
  const openFileDialog = useCallback((): void => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  /**
   * Handle file preview
   */
  const handlePreviewFile = useCallback((file: File): void => {
    setPreviewFile(file);
  }, []);

  /**
   * Close file preview
   */
  const handleClosePreview = useCallback((): void => {
    setPreviewFile(null);
  }, []);

  /**
   * Reset drag counter on mount
   */
  useEffect(() => {
    dragCounterRef.current = 0;
  }, []);

  return (
    <div className="file-upload-container">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={handleFileInputChange}
        className="file-input-hidden"
        disabled={disabled}
      />

      {/* Drop zone */}
      <div
        className={`file-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('fileUpload.dropZoneLabel')}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            openFileDialog();
          }
        }}
      >
        <div className="drop-zone-content">
          <div className="drop-zone-icon">{isDragOver ? '📁' : '📎'}</div>

          <div className="drop-zone-text">
            <p className="drop-zone-primary">
              {isDragOver
                ? t('fileUpload.dropFiles')
                : t('fileUpload.dragOrClick')}
            </p>
            <p className="drop-zone-secondary">
              {t('fileUpload.supportedTypes', {
                types: acceptedTypes.join(', '),
                maxSize: formatFileSize(maxSize),
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="upload-progress">
          <h4 className="progress-title">
            {uploadingFiles.some((f) => f.status === 'scanning')
              ? t('fileUpload.scanning')
              : t('fileUpload.uploading')}
          </h4>

          {uploadingFiles.map((uploadingFile) => {
            const confidence = uploadingFile.securityScan?.confidence;
            const hasConfidence =
              typeof confidence === 'number' &&
              Number.isFinite(confidence) &&
              confidence > 0;
            const errorMessage =
              typeof uploadingFile.error === 'string' &&
              uploadingFile.error.trim().length > 0
                ? uploadingFile.error
                : null;
            const previewContent =
              typeof uploadingFile.preview === 'string' &&
              uploadingFile.preview.length > 0
                ? uploadingFile.preview
                : null;

            return (
              <div key={uploadingFile.id} className="upload-item">
                <div className="upload-info">
                  <span className="file-name">{uploadingFile.file.name}</span>
                  <span className="file-size">
                    {formatFileSize(uploadingFile.file.size)}
                  </span>
                  {showPreview && uploadingFile.status === 'success' && (
                    <button
                      type="button"
                      className="preview-button"
                      onClick={() => handlePreviewFile(uploadingFile.file)}
                      aria-label={t('fileUpload.previewFile', {
                        name: uploadingFile.file.name,
                      })}
                    >
                      👁️
                    </button>
                  )}
                </div>

                <div className="upload-status">
                  {(uploadingFile.status === 'uploading' ||
                    uploadingFile.status === 'scanning') && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${uploadingFile.progress}%` }}
                      />
                    </div>
                  )}

                  {uploadingFile.status === 'success' && (
                    <div
                      className="status-icon success"
                      title={t('fileUpload.uploadSuccess')}
                    >
                      ✓
                    </div>
                  )}

                  {uploadingFile.status === 'error' && (
                    <div
                      className="status-icon error"
                      title={t('fileUpload.uploadError')}
                    >
                      ✗
                    </div>
                  )}

                  {uploadingFile.status === 'scanning' && (
                    <div
                      className="status-icon scanning"
                      title={t('fileUpload.securityScanning')}
                    >
                      🔍
                    </div>
                  )}
                </div>

                {errorMessage !== null && (
                  <div className="upload-error">{errorMessage}</div>
                )}

                {uploadingFile.securityScan?.safe === true && (
                  <div className="security-status safe">
                    <span className="security-icon">🛡️</span>
                    <span className="security-text">
                      {t('fileUpload.security.safe')}
                      {hasConfidence
                        ? ` (${Math.round(confidence * 100)}%)`
                        : ''}
                    </span>
                  </div>
                )}

                {previewContent !== null &&
                  uploadingFile.status === 'success' && (
                    <div className="file-preview-thumbnail">
                      {uploadingFile.file.type.startsWith('image/') ? (
                        <img
                          src={previewContent}
                          alt={t('fileUpload.previewAlt', {
                            name: uploadingFile.file.name,
                          })}
                          className="preview-image"
                        />
                      ) : (
                        <pre className="preview-text">{previewContent}</pre>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile !== null && showPreview && (
        <FilePreview file={previewFile} onClose={handleClosePreview} />
      )}
    </div>
  );
};

FileUploadComponent.displayName = 'FileUpload';

export const FileUpload = memo(FileUploadComponent);
