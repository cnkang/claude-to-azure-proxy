/**
 * SkipLink Component
 *
 * Provides a skip link for keyboard navigation users to bypass repetitive content
 * and jump directly to main content areas. This is a WCAG 2.2 AAA requirement.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface SkipLinkProps {
  /** The ID of the target element to skip to */
  targetId: string;
  /** Custom text for the skip link (optional) */
  text?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SkipLink component for keyboard navigation accessibility
 *
 * Features:
 * - Visually hidden until focused
 * - Keyboard accessible
 * - Customizable target and text
 * - Internationalization support
 */
export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId,
  text,
  className = '',
}) => {
  const { t } = useTranslation();

  const skipText =
    typeof text === 'string' && text.trim().length > 0
      ? text
      : t('accessibility.skipToMainContent', 'Skip to main content');

  const focusTarget = (): void => {
    if (typeof document === 'undefined') {
      return;
    }

    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      return;
    }

    targetElement.focus();

    if (!targetElement.hasAttribute('tabindex')) {
      targetElement.setAttribute('tabindex', '-1');

      window.setTimeout(() => {
        targetElement.removeAttribute('tabindex');
      }, 100);
    }

    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    focusTarget();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLAnchorElement>
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      focusTarget();
    }
  };

  return (
    <a
      href={`#${targetId}`}
      className={`absolute -top-10 left-4 z-50 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium shadow-lg focus:top-4 focus:outline-none focus:ring-4 focus:ring-blue-500 transition-all ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {skipText}
    </a>
  );
};
