import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Glass, cn } from '../ui/Glass.js';
import { useAccessibleAnimation, useAccessibleGestures } from '../../hooks/useAccessibleAnimation';

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly variant?: 'default' | 'danger';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'default',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  
  // Get accessible animation configuration
  const animation = useAccessibleAnimation('bouncy');
  const gestures = useAccessibleGestures();

  // Focus management - focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(event.target as Node)
      ) {
        onCancel();
      }
    };

    // Add a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  const dialogContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" 
      role="presentation"
    >
      <Glass
        ref={dialogRef}
        className="w-full max-w-md flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
        intensity="high"
        border={true}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        data-testid="confirm-dialog"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        </div>

        <div className="flex-1 p-6 bg-white dark:bg-gray-900">
          <p id="confirm-dialog-message" className="text-sm text-gray-700 dark:text-gray-300">
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <motion.button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onClick={onCancel}
            aria-label={cancelLabel}
            data-testid="cancel-button"
            transition={animation}
            {...gestures}
          >
            {cancelLabel}
          </motion.button>
          <motion.button
            ref={confirmButtonRef}
            type="button"
            className={cn(
              "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors",
              variant === 'danger' 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-blue-600 hover:bg-blue-700"
            )}
            onClick={onConfirm}
            aria-label={confirmLabel}
            data-testid="confirm-button"
            transition={animation}
            {...gestures}
          >
            {confirmLabel}
          </motion.button>
        </div>
      </Glass>
    </div>
  );

  // Render dialog at document root using Portal to avoid z-index stacking context issues
  return createPortal(dialogContent, document.body);
};
