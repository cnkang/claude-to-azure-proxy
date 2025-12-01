/**
 * Onboarding Message Component
 *
 * A modal dialog that appears to guide users on how to reopen the sidebar
 * after closing it for the first time on mobile/tablet.
 *
 * Requirements: 21.5, 21.6
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './button';
import { useAccessibleAnimation } from '../../hooks/useAccessibleAnimation';

/**
 * Onboarding Message props
 */
export interface OnboardingMessageProps {
  /** Whether the message is visible */
  visible: boolean;
  /** Callback when the message is dismissed */
  onDismiss: () => void;
  /** Title of the message */
  title: string;
  /** Description text */
  description: string;
  /** Label for the dismiss button */
  dismissLabel: string;
}

/**
 * Onboarding Message component
 * 
 * Displays a modal dialog with:
 * - Semi-transparent backdrop with blur
 * - Centered card with icon, title, description, and dismiss button
 * - Scale and fade animations
 * - Click outside to dismiss
 * - WCAG AAA compliant colors and contrast
 * - Keyboard accessible
 */
export function OnboardingMessage({
  visible,
  onDismiss,
  title,
  description,
  dismissLabel,
}: OnboardingMessageProps): React.JSX.Element {
  // Get accessible animation configuration with gentle spring
  const animation = useAccessibleAnimation('gentle');

  // Info icon SVG
  const infoIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-12 h-12 text-blue-600 dark:text-blue-400"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-description"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={animation}
          onClick={onDismiss}
        >
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={animation}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              {infoIcon}
            </div>

            {/* Title */}
            <h2
              id="onboarding-title"
              className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-3"
            >
              {title}
            </h2>

            {/* Description */}
            <p
              id="onboarding-description"
              className="text-sm text-gray-700 dark:text-gray-300 text-center mb-6 leading-relaxed"
            >
              {description}
            </p>

            {/* Dismiss button */}
            <Button
              onClick={onDismiss}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
            >
              {dismissLabel}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
