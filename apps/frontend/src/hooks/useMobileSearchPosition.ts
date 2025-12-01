/**
 * useMobileSearchPosition Hook
 *
 * Positions search input at bottom 20% of viewport on mobile for thumb reachability.
 * Detects keyboard appearance and adjusts position accordingly.
 *
 * @returns CSS styles for mobile search positioning
 *
 * @example
 * ```tsx
 * function MobileSearch() {
 *   const positionStyles = useMobileSearchPosition();
 *
 *   return (
 *     <div style={positionStyles}>
 *       <Input placeholder="Search..." />
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, CSSProperties } from 'react';

export interface MobileSearchPosition {
  /** CSS styles for positioning */
  style: CSSProperties;
  /** Whether search is in mobile bottom position */
  isMobileBottom: boolean;
  /** Whether keyboard is visible */
  isKeyboardVisible: boolean;
}

/**
 * Detect if device is mobile (< 768px)
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth < 768;
}

/**
 * Detect if keyboard is visible (viewport height reduced)
 */
function isKeyboardVisible(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // On mobile, keyboard appearance reduces visual viewport height
  const visualViewport = window.visualViewport;
  if (visualViewport) {
    // If visual viewport is significantly smaller than window height, keyboard is likely visible
    return visualViewport.height < window.innerHeight * 0.75;
  }

  return false;
}

/**
 * Hook to get mobile search positioning styles
 */
export function useMobileSearchPosition(): MobileSearchPosition {
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
      setKeyboardVisible(isKeyboardVisible());
    };

    const handleVisualViewportResize = () => {
      setKeyboardVisible(isKeyboardVisible());
    };

    // Listen for window resize
    window.addEventListener('resize', handleResize);

    // Listen for visual viewport changes (keyboard appearance)
    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        'resize',
        handleVisualViewportResize
      );
    }

    // Initial check
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          'resize',
          handleVisualViewportResize
        );
      }
    };
  }, []);

  // Calculate position styles
  const style: CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: keyboardVisible ? '10px' : '20%', // Adjust when keyboard is visible
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 2rem)',
        maxWidth: '600px',
        zIndex: 40,
        // Ensure minimum touch target size (44x44px)
        minHeight: '44px',
      }
    : {};

  return {
    style,
    isMobileBottom: isMobile,
    isKeyboardVisible: keyboardVisible,
  };
}

/**
 * Hook to detect if element is in thumb zone (bottom 20% of viewport)
 */
export function useIsInThumbZone(
  elementRef: React.RefObject<HTMLElement>
): boolean {
  const [isInThumbZone, setIsInThumbZone] = useState(false);

  useEffect(() => {
    const checkPosition = () => {
      if (!elementRef.current) {
        return;
      }

      const rect = elementRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const thumbZoneStart = viewportHeight * 0.8; // Bottom 20%

      // Check if element is within thumb zone
      const inZone = rect.top >= thumbZoneStart;
      setIsInThumbZone(inZone);
    };

    checkPosition();

    // Re-check on scroll and resize
    window.addEventListener('scroll', checkPosition);
    window.addEventListener('resize', checkPosition);

    return () => {
      window.removeEventListener('scroll', checkPosition);
      window.removeEventListener('resize', checkPosition);
    };
  }, [elementRef]);

  return isInThumbZone;
}
