/**
 * Message Input Component
 * 
 * Chat input with file upload support, auto-resize, keyboard shortcuts,
 * and accessibility features.
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */

import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import type { JSX } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { FileUpload } from './FileUpload.js';
import { frontendLogger } from '../../utils/logger.js';
// import type { FileInfo } from '../../types/index';
import './MessageInput.css';

interface MessageInputProps {
  readonly onSendMessage: (message: string, files?: File[]) => void | Promise<void>;
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
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = e.target.value;
    
    // Enforce max length
    if (value.length <= maxLength) {
      setMessage(value);
      setError(null);
    } else {
      setError(t('chat.messageTooLong', { max: maxLength }));
    }
  }, [maxLength, t]);

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
    Promise.resolve(onSendMessage(trimmedMessage, attachedFiles.length > 0 ? attachedFiles : undefined))
      .catch((err: unknown) => {
        const normalizedError = err instanceof Error ? err : new Error(String(err));
        frontendLogger.error('Failed to send message', { error: normalizedError });
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
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    
    // Clear error on typing
    if (error !== null) {
      setError(null);
    }
  }, [handleSendMessage, error]);

  /**
   * Handle file selection
   */
  const handleFilesSelected = useCallback((files: File[]): void => {
    setAttachedFiles(prev => [...prev, ...files]);
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
    setAttachedFiles(prev => prev.filter(file => file.name !== fileName));
  }, []);

  /**
   * Toggle file upload
   */
  const toggleFileUpload = useCallback((): void => {
    setShowFileUpload(prev => !prev);
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
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  /**
   * Focus textarea on mount
   */
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const canSend = (message.trim().length > 0 || attachedFiles.length > 0) && !disabled;
  const characterCount = message.length;
  const isNearLimit = characterCount > maxLength * 0.8;

  return (
    <div className="message-input-container">
      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="attached-files">
          <div className="attached-files-header">
            <span className="attached-files-title">
              {t('chat.attachedFiles', { count: attachedFiles.length })}
            </span>
          </div>
          
          <div className="attached-files-list">
            {attachedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="attached-file">
                <div className="file-info">
                  <span className="file-icon">📎</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
                
                <button
                  type="button"
                  className="remove-file-button"
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
        <div className="file-upload-panel" ref={fileUploadRef}>
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
        <div className="input-error" role="alert">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
        </div>
      )}

      {/* Input Area */}
      <div className={`message-input-area ${disabled ? 'disabled' : ''}`}>
        <div className="input-wrapper">
          {/* File Upload Button */}
          <button
            type="button"
            className={`file-upload-button ${showFileUpload ? 'active' : ''}`}
            onClick={toggleFileUpload}
            disabled={disabled}
            aria-label={t('chat.attachFile')}
            title={t('chat.attachFile')}
          >
            📎
          </button>

          {/* Message Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t('chat.inputPlaceholder')}
            disabled={disabled}
            className="message-textarea"
            rows={1}
            maxLength={maxLength}
            aria-label={t('chat.messageInput')}
          />

          {/* Send Button */}
          <button
            type="button"
            className={`send-button ${canSend ? 'enabled' : 'disabled'}`}
            onClick={handleSendMessage}
            disabled={!canSend}
            aria-label={t('chat.sendMessage')}
            title={t('chat.sendMessage')}
          >
            <span className="send-icon">→</span>
          </button>
        </div>

        {/* Character Count */}
        {isNearLimit && (
          <div className="character-count">
            <span className={characterCount >= maxLength ? 'over-limit' : 'near-limit'}>
              {characterCount}/{maxLength}
            </span>
          </div>
        )}

        {/* Keyboard Hint */}
        <div className="keyboard-hint">
          <span className="hint-text">
            {t('chat.keyboardHint')}
          </span>
        </div>
      </div>
    </div>
  );
};

MessageInputComponent.displayName = 'MessageInput';

export const MessageInput = memo(MessageInputComponent);
