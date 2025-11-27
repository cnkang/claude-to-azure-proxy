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
import { Glass } from '../ui/Glass.js';
import { cn } from '../ui/Glass.js';

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
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Drop zone */}
      <Glass
        intensity="low"
        border={true}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
          isDragOver 
            ? "border-blue-500 bg-blue-50/20 dark:bg-blue-900/20 scale-[1.02]" 
            : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-white/5 dark:hover:bg-white/5",
          disabled && "opacity-50 cursor-not-allowed hover:border-gray-300 dark:hover:border-gray-600 hover:bg-transparent"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('fileUpload.dropZoneLabel')}
        onKeyDown={(e: React.KeyboardEvent) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            openFileDialog();
          }
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl">{isDragOver ? '📁' : '📎'}</div>

          <div className="flex flex-col gap-1">
            <p className="text-base font-medium text-gray-700 dark:text-gray-200">
              {isDragOver
                ? t('fileUpload.dropFiles')
                : t('fileUpload.dragOrClick')}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('fileUpload.supportedTypes', {
                types: acceptedTypes.join(', '),
                maxSize: formatFileSize(maxSize),
              })}
            </p>
          </div>
        </div>
      </Glass>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
              <Glass key={uploadingFile.id} intensity="low" border={true} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-medium truncate max-w-[200px]">{uploadingFile.file.name}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {formatFileSize(uploadingFile.file.size)}
                    </span>
                  </div>
                  {showPreview && uploadingFile.status === 'success' && (
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      onClick={() => handlePreviewFile(uploadingFile.file)}
                      aria-label={t('fileUpload.previewFile', {
                        name: uploadingFile.file.name,
                      })}
                    >
                      👁️
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {(uploadingFile.status === 'uploading' ||
                    uploadingFile.status === 'scanning') && (
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${uploadingFile.progress}%` }}
                      />
                    </div>
                  )}

                  {uploadingFile.status === 'success' && (
                    <div
                      className="text-green-700"
                      title={t('fileUpload.uploadSuccess')}
                    >
                      ✓
                    </div>
                  )}

                  {uploadingFile.status === 'error' && (
                    <div
                      className="text-red-700"
                      title={t('fileUpload.uploadError')}
                    >
                      ✗
                    </div>
                  )}

                  {uploadingFile.status === 'scanning' && (
                    <div
                      className="text-blue-700 animate-pulse"
                      title={t('fileUpload.securityScanning')}
                    >
                      🔍
                    </div>
                  )}
                </div>

                {errorMessage !== null && (
                  <div className="mt-2 text-xs text-red-700">{errorMessage}</div>
                )}

                {uploadingFile.securityScan?.safe === true && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-200">
                    <span>🛡️</span>
                    <span>
                      {t('fileUpload.security.safe')}
                      {hasConfidence
                        ? ` (${Math.round(confidence * 100)}%)`
                        : ''}
                    </span>
                  </div>
                )}

                {previewContent !== null &&
                  uploadingFile.status === 'success' && (
                    <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden">
                      {uploadingFile.file.type.startsWith('image/') ? (
                        <img
                          src={previewContent}
                          alt={t('fileUpload.previewAlt', {
                            name: uploadingFile.file.name,
                          })}
                          className="max-h-32 rounded object-contain"
                        />
                      ) : (
                        <pre className="text-xs font-mono overflow-x-auto p-1">{previewContent}</pre>
                      )}
                    </div>
                  )}
              </Glass>
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
