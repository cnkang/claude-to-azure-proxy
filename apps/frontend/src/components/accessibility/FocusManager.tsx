/**
 * Focus Manager Component
 *
 * Provides comprehensive focus management utilities including focus trapping,
 * focus restoration, and focus indicators for better keyboard navigation.
 *
 * Requirements: 1.5, 10.4
 */

import type React from 'react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface FocusManagerProps {
  children: ReactNode;
  trapFocus?: boolean;
  restoreFocus?: boolean;
  autoFocus?: boolean;
  className?: string;
}

interface FocusIndicatorProps {
  visible: boolean;
  className?: string;
}

interface FocusManagerHookResult {
  containerRef: React.RefObject<HTMLDivElement>;
  focusFirst: () => void;
  focusLast: () => void;
  focusNext: () => void;
  focusPrevious: () => void;
  getFocusableElements: () => HTMLElement[];
}

/**
 * Focus manager component for handling focus behavior
 */
export const FocusManager: React.FC<FocusManagerProps> = ({
  children,
  trapFocus = false,
  restoreFocus = false,
  autoFocus = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [focusVisible, setFocusVisible] = useState<boolean>(false);

  /**
   * Get all focusable elements within the container
   */
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) {
      return [];
    }

    const focusableSelectors = [
      'button:not([disabled]):not([aria-hidden="true"])',
      'input:not([disabled]):not([aria-hidden="true"])',
      'textarea:not([disabled]):not([aria-hidden="true"])',
      'select:not([disabled]):not([aria-hidden="true"])',
      'a[href]:not([aria-hidden="true"])',
      '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
      '[contenteditable="true"]:not([aria-hidden="true"])',
      'audio[controls]:not([aria-hidden="true"])',
      'video[controls]:not([aria-hidden="true"])',
      'iframe:not([aria-hidden="true"])',
      'object:not([aria-hidden="true"])',
      'embed:not([aria-hidden="true"])',
      'area[href]:not([aria-hidden="true"])',
      'summary:not([aria-hidden="true"])',
    ].join(', ');

    return Array.from(
      containerRef.current.querySelectorAll(focusableSelectors)
    ).filter((element) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);

      return (
        htmlElement.offsetWidth > 0 &&
        htmlElement.offsetHeight > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        !htmlElement.hasAttribute('inert')
      );
    }) as HTMLElement[];
  }, []);

  /**
   * Handle focus trap
   */
  const handleFocusTrap = useCallback(
    (event: KeyboardEvent): void => {
      if (!trapFocus || event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const isActiveInside =
        activeElement !== null && focusableElements.includes(activeElement);

      if (event.shiftKey) {
        if (!isActiveInside || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!isActiveInside || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    },
    [trapFocus, getFocusableElements]
  );

  /**
   * Handle focus visibility
   */
  const handleFocusIn = useCallback((): void => {
    setFocusVisible(true);
  }, []);

  const handleFocusOut = useCallback((): void => {
    // Delay hiding focus indicator to prevent flicker
    window.setTimeout(() => {
      const containerElement = containerRef.current;
      const activeElement = document.activeElement;

      if (
        containerElement &&
        activeElement instanceof HTMLElement &&
        !containerElement.contains(activeElement)
      ) {
        setFocusVisible(false);
      }
    }, 0);
  }, []);

  /**
   * Handle mouse down to hide focus indicators for mouse users
   */
  const handleMouseDown = useCallback((): void => {
    setFocusVisible(false);
  }, []);

  /**
   * Set up focus management
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Store previous focus for restoration
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

    // Add event listeners
    if (trapFocus) {
      container.addEventListener('keydown', handleFocusTrap);
    }
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    container.addEventListener('mousedown', handleMouseDown);

    return (): void => {
      if (trapFocus) {
        container.removeEventListener('keydown', handleFocusTrap);
      }
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
      container.removeEventListener('mousedown', handleMouseDown);

      // Restore previous focus
      if (restoreFocus && previousFocusRef.current !== null) {
        try {
          previousFocusRef.current.focus();
        } catch {
          // Ignore focus errors (element might be removed)
        }
      }
    };
  }, [
    handleFocusTrap,
    handleFocusIn,
    handleFocusOut,
    handleMouseDown,
    autoFocus,
    restoreFocus,
    getFocusableElements,
    trapFocus,
  ]);

  return (
    <div
      ref={containerRef}
      className={`focus-manager ${focusVisible ? 'focus-visible' : ''} ${className}`}
      data-focus-trap={trapFocus}
      data-auto-focus={autoFocus}
      data-restore-focus={restoreFocus}
    >
      {children}
      {focusVisible && <FocusIndicator visible={focusVisible} />}
    </div>
  );
};

/**
 * Focus indicator component for visual focus feedback
 */
export const FocusIndicator: React.FC<FocusIndicatorProps> = ({
  visible,
  className = '',
}) => {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!visible) {
      setPosition(null);
      return;
    }

    const updatePosition = (): void => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body
      ) {
        const rect = activeElement.getBoundingClientRect();
        setPosition({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setPosition(null);
      }
    };

    updatePosition();

    // Update position on scroll and resize
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return (): void => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible]);

  if (!visible || position === null) {
    return null;
  }

  return (
    <div
      className={`focus-indicator ${className}`}
      style={{
        position: 'absolute',
        top: position.top - 2,
        left: position.left - 2,
        width: position.width + 4,
        height: position.height + 4,
        border: '2px solid var(--color-accent, #1a73e8)',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 9999,
        transition: 'all 0.15s ease',
      }}
      aria-hidden="true"
    />
  );
};

/**
 * Hook for managing focus within a specific element
 */
export const useFocusManager = (
  options: {
    trapFocus?: boolean;
    restoreFocus?: boolean;
    autoFocus?: boolean;
  } = {}
): FocusManagerHookResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const {
    trapFocus = false,
    restoreFocus = false,
    autoFocus = false,
  } = options;

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) {
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
    ].join(', ');

    return Array.from(
      containerRef.current.querySelectorAll(focusableSelectors)
    ).filter((element) => {
      const htmlElement = element as HTMLElement;
      return (
        htmlElement.offsetWidth > 0 &&
        htmlElement.offsetHeight > 0 &&
        !htmlElement.hasAttribute('aria-hidden')
      );
    }) as HTMLElement[];
  }, []);

  const focusFirst = useCallback((): void => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, [getFocusableElements]);

  const focusLast = useCallback((): void => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[focusableElements.length - 1].focus();
    }
  }, [getFocusableElements]);

  const focusNext = useCallback((): void => {
    const focusableElements = getFocusableElements();
    const currentIndex = focusableElements.indexOf(
      document.activeElement as HTMLElement
    );
    const nextIndex =
      currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
    const nextElement = focusableElements.at(nextIndex) ?? null;
    nextElement?.focus();
  }, [getFocusableElements]);

  const focusPrevious = useCallback((): void => {
    const focusableElements = getFocusableElements();
    const currentIndex = focusableElements.indexOf(
      document.activeElement as HTMLElement
    );
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
    const previousElement = focusableElements.at(prevIndex) ?? null;
    previousElement?.focus();
  }, [getFocusableElements]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (!trapFocus || event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const isActiveInside =
        activeElement !== null && focusableElements.includes(activeElement);

      if (event.shiftKey) {
        if (!isActiveInside || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!isActiveInside || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    },
    [trapFocus, getFocusableElements]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (restoreFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    if (autoFocus) {
      focusFirst();
    }

    if (trapFocus) {
      container.addEventListener('keydown', handleKeyDown);
    }

    return (): void => {
      if (trapFocus) {
        container.removeEventListener('keydown', handleKeyDown);
      }

      if (restoreFocus && previousFocusRef.current !== null) {
        try {
          previousFocusRef.current.focus();
        } catch {
          // Ignore focus errors
        }
      }
    };
  }, [autoFocus, restoreFocus, focusFirst, handleKeyDown, trapFocus]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    getFocusableElements,
  };
};

export default FocusManager;
