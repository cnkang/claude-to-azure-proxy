/**
 * Message Input Component
 *
 * Chat input with file upload support, auto-resize, keyboard shortcuts,
 * and accessibility features.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import type React from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { frontendLogger } from '../../utils/logger.js';
import { Glass } from '../ui/Glass.js';
import { cn } from '../ui/Glass.js';
import { FileUpload } from './FileUpload.js';
// import type { FileInfo } from '../../types/index';

interface MessageInputProps {
  readonly onSendMessage: (
    message: string,
    files?: File[]
  ) => void | Promise<void>;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly acceptedFileTypes: string[];
  readonly maxFileSize: number;
  readonly maxFiles?: number;
}

/**
 * Message input component with file upload and auto-resize
 */
const MessageInputComponent = ({
  onSendMessage,
  disabled = false,
  placeholder,
  maxLength = 4000,
  acceptedFileTypes,
  maxFileSize,
  maxFiles = 5,
}: MessageInputProps): JSX.Element => {
  const { t, formatFileSize } = useI18n();
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileUploadRef = useRef<HTMLDivElement>(null);

  /**
   * Auto-resize textarea based on content
   */
  const adjustTextareaHeight = useCallback((): void => {
    const textarea = textareaRef.current;
    if (textarea !== null) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Maximum height in pixels
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, []);

  /**
   * Handle message input change
   */
  const handleMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const value = e.target.value;

      // Enforce max length
      if (value.length <= maxLength) {
        setMessage(value);
        setError(null);
      } else {
        setError(t('chat.messageTooLong', { max: maxLength }));
      }
    },
    [maxLength, t]
  );

  /**
   * Handle send message
   */
  const handleSendMessage = useCallback((): void => {
    const trimmedMessage = message.trim();

    // Validate message
    if (!trimmedMessage && attachedFiles.length === 0) {
      setError(t('chat.emptyMessage'));
      return;
    }

    if (disabled) {
      return;
    }

    // Send message
    Promise.resolve(
      onSendMessage(
        trimmedMessage,
        attachedFiles.length > 0 ? attachedFiles : undefined
      )
    ).catch((err: unknown) => {
      const normalizedError =
        err instanceof Error ? err : new Error(String(err));
      frontendLogger.error('Failed to send message', {
        error: normalizedError,
      });
      setError(normalizedError.message);
    });

    // Clear input
    setMessage('');
    setAttachedFiles([]);
    setShowFileUpload(false);
    setError(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachedFiles, disabled, onSendMessage, t]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Send on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }

      // Clear error on typing
      if (error !== null) {
        setError(null);
      }
    },
    [handleSendMessage, error]
  );

  /**
   * Handle file selection
   */
  const handleFilesSelected = useCallback((files: File[]): void => {
    setAttachedFiles((prev) => [...prev, ...files]);
    setShowFileUpload(false);
    setError(null);
  }, []);

  /**
   * Handle file upload error
   */
  const handleFileError = useCallback((errorMessage: string): void => {
    setError(errorMessage);
  }, []);

  /**
   * Remove attached file
   */
  const removeAttachedFile = useCallback((fileName: string): void => {
    setAttachedFiles((prev) => prev.filter((file) => file.name !== fileName));
  }, []);

  /**
   * Toggle file upload
   */
  const toggleFileUpload = useCallback((): void => {
    setShowFileUpload((prev) => !prev);
    setError(null);
  }, []);

  /**
   * Close file upload on outside click
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (
        showFileUpload &&
        fileUploadRef.current !== null &&
        !fileUploadRef.current.contains(event.target as Node)
      ) {
        setShowFileUpload(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFileUpload]);

  /**
   * Auto-resize textarea on content change
   */
  useEffect(() => {
    const messageLength = message.length;
    if (messageLength >= 0) {
      adjustTextareaHeight();
    }
  }, [message, adjustTextareaHeight]);

  /**
   * Focus textarea on mount
   */
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const canSend =
    (message.trim().length > 0 || attachedFiles.length > 0) && !disabled;
  const characterCount = message.length;
  const isNearLimit = characterCount > maxLength * 0.8;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4">
      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('chat.attachedFiles', { count: attachedFiles.length })}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm text-gray-700 dark:text-gray-300"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📎</span>
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <span className="text-xs opacity-70">
                    ({formatFileSize(file.size)})
                  </span>
                </div>

                <button
                  type="button"
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  onClick={() => removeAttachedFile(file.name)}
                  aria-label={t('chat.removeFile', { name: file.name })}
                >
                  ✗
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Upload */}
      {showFileUpload && (
        <div className="mb-4" ref={fileUploadRef}>
          <FileUpload
            acceptedTypes={acceptedFileTypes}
            maxSize={maxFileSize}
            maxFiles={maxFiles}
            onFilesSelected={handleFilesSelected}
            onError={handleFileError}
            disabled={disabled}
          />
        </div>
      )}

      {/* Error Message */}
      {error !== null && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-200 flex items-center gap-2"
          role="alert"
        >
          <span className="text-lg">⚠️</span>
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Input Area */}
      <Glass
        intensity="medium"
        border={true}
        className={cn(
          'relative rounded-2xl transition-all duration-200',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <div className="flex items-end gap-2 p-2">
          {/* File Upload Button */}
          <button
            type="button"
            className={cn(
              'p-3 rounded-xl hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-300',
              showFileUpload && 'bg-white/10 text-blue-700 dark:text-blue-200'
            )}
            onClick={toggleFileUpload}
            disabled={disabled}
            aria-label={t('chat.attachFile')}
            title={t('chat.attachFile')}
          >
            <span className="text-xl">📎</span>
          </button>

          {/* Message Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t('chat.inputPlaceholder')}
            disabled={disabled}
            className="flex-1 bg-transparent border-none outline-none resize-none py-3 px-2 max-h-[200px] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            rows={1}
            maxLength={maxLength}
            aria-label={t('chat.messageInput')}
          />

          {/* Send Button */}
          <button
            type="button"
            className={cn(
              'p-3 rounded-xl transition-all duration-200',
              canSend
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 cursor-not-allowed'
            )}
            onClick={handleSendMessage}
            disabled={!canSend}
            aria-label={t('chat.sendMessage')}
            title={t('chat.sendMessage')}
          >
            <span className="text-xl">→</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="px-4 pb-2 flex justify-between items-center text-xs text-gray-700 dark:text-gray-300">
          <div className="flex-1 text-center">{t('chat.keyboardHint')}</div>

          {/* Character Count */}
          {isNearLimit && (
            <div
              className={cn(
                'font-mono',
                characterCount >= maxLength ? 'text-red-700' : 'text-yellow-700'
              )}
            >
              {characterCount}/{maxLength}
            </div>
          )}
        </div>
      </Glass>
    </div>
  );
};

MessageInputComponent.displayName = 'MessageInput';

export const MessageInput = memo(MessageInputComponent);
