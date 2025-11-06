/**
 * Screen Reader Announcer Component
 * 
 * Provides live region announcements for screen readers to communicate
 * dynamic content changes and important status updates.
 * 
 * Requirements: 1.5, 10.4
 */

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';

declare global {
  interface Window {
    announceToScreenReader?: (message: string, priority: 'polite' | 'assertive', clearAfter?: number) => void;
  }
}

export interface AnnouncementProps {
  message: string;
  priority: 'polite' | 'assertive';
  clearAfter?: number; // Clear message after X milliseconds
}

interface ScreenReaderAnnouncerProps {
  className?: string;
}

/**
 * Screen reader announcer with live regions
 */
export const ScreenReaderAnnouncer: React.FC<ScreenReaderAnnouncerProps> = ({
  className = ''
}) => {
  const [politeMessage, setPoliteMessage] = useState<string>('');
  const [assertiveMessage, setAssertiveMessage] = useState<string>('');
  const politeTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const assertiveTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  /**
   * Announce a message to screen readers
   */
  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite', clearAfter = 5000): void => {
    if (message.trim().length === 0) {
      return;
    }

    if (priority === 'assertive') {
      // Clear any existing timeout
      if (assertiveTimeoutRef.current !== null) {
        globalThis.clearTimeout(assertiveTimeoutRef.current);
      }
      
      setAssertiveMessage(message);
      
      // Clear message after specified time
      assertiveTimeoutRef.current = globalThis.setTimeout(() => {
        setAssertiveMessage('');
      }, clearAfter);
    } else {
      // Clear any existing timeout
      if (politeTimeoutRef.current !== null) {
        globalThis.clearTimeout(politeTimeoutRef.current);
      }
      
      setPoliteMessage(message);
      
      // Clear message after specified time
      politeTimeoutRef.current = globalThis.setTimeout(() => {
        setPoliteMessage('');
      }, clearAfter);
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return (): void => {
      if (politeTimeoutRef.current !== null) {
        globalThis.clearTimeout(politeTimeoutRef.current);
      }
      if (assertiveTimeoutRef.current !== null) {
        globalThis.clearTimeout(assertiveTimeoutRef.current);
      }
    };
  }, []);

  // Expose announce function globally for use throughout the app
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.announceToScreenReader = announce;
    
    return (): void => {
      if (window.announceToScreenReader) {
        delete window.announceToScreenReader;
      }
    };
  }, []);

  return (
    <div className={`screen-reader-announcer ${className}`}>
      {/* Polite announcements - won't interrupt current speech */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="polite-announcer"
      >
        {politeMessage}
      </div>
      
      {/* Assertive announcements - will interrupt current speech */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="assertive-announcer"
      >
        {assertiveMessage}
      </div>
    </div>
  );
};

/**
 * Hook for announcing messages to screen readers
 */
export const useScreenReaderAnnouncer = (): {
  announce: (messageKey: string, priority?: 'polite' | 'assertive', interpolation?: Record<string, unknown>, clearAfter?: number) => void;
  announceRaw: (message: string, priority?: 'polite' | 'assertive', clearAfter?: number) => void;
} => {
  const { t } = useI18n();

  const announce = (
    messageKey: string, 
    priority: 'polite' | 'assertive' = 'polite',
    interpolation?: Record<string, unknown>,
    clearAfter = 5000
  ): void => {
    const message = t(messageKey, interpolation);
    
    if (typeof window !== 'undefined' && typeof window.announceToScreenReader === 'function') {
      window.announceToScreenReader(message, priority, clearAfter);
    }
  };

  const announceRaw = (
    message: string,
    priority: 'polite' | 'assertive' = 'polite',
    clearAfter = 5000
  ): void => {
    if (typeof window !== 'undefined' && typeof window.announceToScreenReader === 'function') {
      window.announceToScreenReader(message, priority, clearAfter);
    }
  };

  return { announce, announceRaw };
};

/**
 * Component for individual announcements
 */
export const Announcement: React.FC<AnnouncementProps> = ({
  message,
  priority,
  clearAfter = 5000
}) => {
  const [currentMessage, setCurrentMessage] = useState<string>(message);
  const timeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(() => {
    setCurrentMessage(message);
    
    if (clearAfter > 0) {
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = globalThis.setTimeout(() => {
        setCurrentMessage('');
      }, clearAfter);
    }

    return (): void => {
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearAfter]);

  if (priority === 'assertive') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {currentMessage}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {currentMessage}
    </div>
  );
};

export default ScreenReaderAnnouncer;
