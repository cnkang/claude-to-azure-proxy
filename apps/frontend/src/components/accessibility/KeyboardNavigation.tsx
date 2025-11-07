/**
 * Keyboard Navigation Component
 *
 * Provides keyboard navigation utilities including focus management,
 * keyboard shortcuts, and focus trapping for modal dialogs.
 *
 * Requirements: 1.5, 10.4
 */

import React, { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useI18n } from '../../contexts/I18nContext';

export interface KeyboardNavigationProps {
  children: ReactNode;
  onEscape?: () => void;
  onEnter?: () => void;
  trapFocus?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  className?: string;
}

/**
 * Keyboard navigation wrapper component
 */
export const KeyboardNavigation: React.FC<KeyboardNavigationProps> = ({
  children,
  onEscape,
  onEnter,
  trapFocus = false,
  autoFocus = false,
  restoreFocus = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { t } = useI18n();

  /**
   * Get all focusable elements within the container
   */
  const getFocusableElements = useCallback((): HTMLElement[] => {
    const container = containerRef.current;
    if (!container) {
      return [];
    }

    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      'audio[controls]',
      'video[controls]',
      'iframe',
      'object',
      'embed',
      'area[href]',
      'summary',
    ].join(', ');

    return Array.from(container.querySelectorAll(focusableSelectors)).filter(
      (element) => {
        const htmlElement = element as HTMLElement;
        return (
          htmlElement.offsetWidth > 0 &&
          htmlElement.offsetHeight > 0 &&
          !htmlElement.hasAttribute('aria-hidden') &&
          window.getComputedStyle(htmlElement).visibility !== 'hidden'
        );
      }
    ) as HTMLElement[];
  }, []);

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      const container = containerRef.current;

      switch (event.key) {
        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;

        case 'Enter':
          if (onEnter && container && event.target === container) {
            event.preventDefault();
            onEnter();
          }
          break;

        case 'Tab':
          if (trapFocus) {
            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) {
              event.preventDefault();
              return;
            }

            const firstElement = focusableElements.at(0) ?? null;
            const lastElement = focusableElements.at(-1) ?? null;
            const activeElement =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            const isActiveInside =
              activeElement !== null &&
              focusableElements.includes(activeElement);

            if (event.shiftKey) {
              if (!isActiveInside || activeElement === firstElement) {
                event.preventDefault();
                lastElement?.focus();
              }
            } else if (!isActiveInside || activeElement === lastElement) {
              event.preventDefault();
              firstElement?.focus();
            }
          }
          break;

        case 'ArrowDown':
        case 'ArrowUp':
          // Handle arrow key navigation for lists and menus
          if (
            container &&
            (container.getAttribute('role') === 'menu' ||
              container.getAttribute('role') === 'listbox')
          ) {
            event.preventDefault();
            const focusableElements = getFocusableElements();
            const activeElement =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            const currentIndex = activeElement
              ? focusableElements.indexOf(activeElement)
              : -1;

            let nextIndex: number;
            if (event.key === 'ArrowDown') {
              nextIndex =
                currentIndex < focusableElements.length - 1
                  ? currentIndex + 1
                  : 0;
            } else {
              nextIndex =
                currentIndex > 0
                  ? currentIndex - 1
                  : focusableElements.length - 1;
            }

            const nextElement = focusableElements.at(nextIndex) ?? null;
            nextElement?.focus();
          }
          break;

        case 'Home':
          if (
            container &&
            (container.getAttribute('role') === 'menu' ||
              container.getAttribute('role') === 'listbox')
          ) {
            event.preventDefault();
            const focusableElements = getFocusableElements();
            const firstElement = focusableElements.at(0) ?? null;
            firstElement?.focus();
          }
          break;

        case 'End':
          if (
            container &&
            (container.getAttribute('role') === 'menu' ||
              container.getAttribute('role') === 'listbox')
          ) {
            event.preventDefault();
            const focusableElements = getFocusableElements();
            const lastElement = focusableElements.at(-1) ?? null;
            lastElement?.focus();
          }
          break;
      }
    },
    [onEscape, onEnter, trapFocus, getFocusableElements]
  );

  /**
   * Set up keyboard event listeners
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Store previous focus if we need to restore it
    if (restoreFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Auto focus first focusable element
    if (autoFocus) {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements.at(0) ?? null;
      if (firstElement) {
        firstElement.focus();
      } else {
        container.focus();
      }
    }

    // Add keyboard event listener
    container.addEventListener('keydown', handleKeyDown);

    return (): void => {
      container.removeEventListener('keydown', handleKeyDown);

      // Restore previous focus
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [handleKeyDown, autoFocus, restoreFocus, getFocusableElements]);

  return (
    <div
      ref={containerRef}
      className={`keyboard-navigation ${className}`}
      tabIndex={trapFocus ? -1 : undefined}
      aria-label={trapFocus ? t('accessibility.focusTrap') : undefined}
    >
      {children}
    </div>
  );
};

/**
 * Skip link component for keyboard navigation
 */
export interface SkipLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export const SkipLink: React.FC<SkipLinkProps> = ({
  href,
  children,
  className = '',
}) => {
  return (
    <a
      href={href}
      className={`skip-link ${className}`}
      onFocus={(e) => {
        // Ensure skip link is visible when focused
        e.currentTarget.style.position = 'absolute';
        e.currentTarget.style.top = '6px';
        e.currentTarget.style.left = '6px';
        e.currentTarget.style.zIndex = '9999';
      }}
      onBlur={(e) => {
        // Hide skip link when not focused
        e.currentTarget.style.position = 'absolute';
        e.currentTarget.style.top = '-40px';
        e.currentTarget.style.left = '6px';
      }}
    >
      {children}
    </a>
  );
};

/**
 * Focus trap hook for managing focus within a container
 */
export const useFocusTrap = (
  isActive: boolean = true
): React.RefObject<HTMLElement | null> => {
  const containerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const getFocusableElements = (): HTMLElement[] => {
      const focusableSelectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ].join(', ');

      return Array.from(container.querySelectorAll(focusableSelectors)).filter(
        (element) => {
          const htmlElement = element as HTMLElement;
          return (
            htmlElement.offsetWidth > 0 &&
            htmlElement.offsetHeight > 0 &&
            !htmlElement.hasAttribute('aria-hidden')
          );
        }
      ) as HTMLElement[];
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements.at(0) ?? null;
        const lastElement = focusableElements.at(-1) ?? null;
        const activeElement =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const isActiveInside =
          activeElement !== null && focusableElements.includes(activeElement);

        if (event.shiftKey) {
          if (!isActiveInside || activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else if (!isActiveInside || activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    // Focus first element
    const focusableElements = getFocusableElements();
    const firstElement = focusableElements.at(0) ?? null;
    if (firstElement) {
      firstElement.focus();
    }

    document.addEventListener('keydown', handleKeyDown);

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);

      // Restore previous focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
};

/**
 * Roving tabindex hook for managing focus in lists and grids
 */
export const useRovingTabindex = (
  items: HTMLElement[],
  activeIndex: number = 0
): {
  handleKeyDown: (
    event: KeyboardEvent,
    currentIndex: number,
    onIndexChange: (index: number) => void
  ) => void;
} => {
  useEffect(() => {
    items.forEach((item, index) => {
      if (index === activeIndex) {
        item.setAttribute('tabindex', '0');
      } else {
        item.setAttribute('tabindex', '-1');
      }
    });
  }, [items, activeIndex]);

  const handleKeyDown = useCallback(
    (
      event: KeyboardEvent,
      currentIndex: number,
      onIndexChange: (index: number) => void
    ): void => {
      let newIndex = currentIndex;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          break;

        case 'Home':
          event.preventDefault();
          newIndex = 0;
          break;

        case 'End':
          event.preventDefault();
          newIndex = items.length - 1;
          break;

        default:
          return;
      }

      onIndexChange(newIndex);
      const nextElement = items.at(newIndex) ?? null;
      nextElement?.focus();
    },
    [items]
  );

  return { handleKeyDown };
};

export default KeyboardNavigation;
