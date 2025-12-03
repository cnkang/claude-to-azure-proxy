/**
 * useScrollBehavior Hook
 *
 * Detects scroll direction and position for dynamic UI behavior.
 * Uses React 19.2's concurrent rendering for non-blocking scroll calculations.
 *
 * @returns Scroll behavior state including direction, position, and collapsed state
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { isCollapsed, scrollDirection, scrollY } = useScrollBehavior();
 *
 *   return (
 *     <motion.header
 *       animate={{ height: isCollapsed ? '48px' : '64px' }}
 *       transition={useAccessibleAnimation('gentle')}
 *     >
 *       Header content
 *     </motion.header>
 *   );
 * }
 * ```
 */

import { useEffect, useRef, useState } from 'react';

export interface ScrollBehavior {
  /** Current scroll direction */
  scrollDirection: 'up' | 'down' | 'none';
  /** Current scroll position in pixels */
  scrollY: number;
  /** Whether the header should be collapsed */
  isCollapsed: boolean;
  /** Scroll velocity in pixels per frame */
  velocity: number;
}

/**
 * Threshold for collapsing the header (in pixels)
 */
const COLLAPSE_THRESHOLD = 50;

/**
 * Minimum velocity to trigger direction change (in pixels per frame)
 */
const VELOCITY_THRESHOLD = 1;

export function useScrollBehavior(): ScrollBehavior {
  const [scrollDirection, setScrollDirection] = useState<
    'up' | 'down' | 'none'
  >('none');
  const [scrollY, setScrollY] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [velocity, setVelocity] = useState(0);

  // Use refs to avoid re-renders on every scroll event
  const lastScrollY = useRef(0);
  const lastTimestamp = useRef(Date.now());
  const ticking = useRef(false);

  useEffect(() => {
    // Server-side rendering safety
    if (typeof window === 'undefined') {
      return;
    }

    const handleScroll = () => {
      // Request animation frame for smooth 60fps updates
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const currentTimestamp = Date.now();

          // Calculate velocity (pixels per millisecond)
          const timeDelta = currentTimestamp - lastTimestamp.current;
          const scrollDelta = currentScrollY - lastScrollY.current;
          const currentVelocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

          // Determine scroll direction based on velocity
          let newDirection: 'up' | 'down' | 'none' = 'none';
          if (Math.abs(currentVelocity) > VELOCITY_THRESHOLD / 1000) {
            newDirection = currentVelocity > 0 ? 'down' : 'up';
          }

          // Determine if header should be collapsed
          // Collapse when: scrolling down AND past threshold
          // Expand when: scrolling up OR at top of page
          const shouldCollapse =
            currentScrollY > COLLAPSE_THRESHOLD && newDirection === 'down';

          // React 19.2's automatic batching will batch these state updates
          setScrollY(currentScrollY);
          setScrollDirection(newDirection);
          setIsCollapsed(shouldCollapse);
          setVelocity(currentVelocity);

          // Update refs for next calculation
          lastScrollY.current = currentScrollY;
          lastTimestamp.current = currentTimestamp;
          ticking.current = false;
        });

        ticking.current = true;
      }
    };

    // Initial scroll position
    handleScroll();

    // Listen for scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return {
    scrollDirection,
    scrollY,
    isCollapsed,
    velocity,
  };
}

/**
 * Hook to detect if user is near the top of the page
 *
 * @param threshold - Distance from top in pixels (default: 10)
 * @returns true if within threshold of top
 */
export function useIsNearTop(threshold = 10): boolean {
  const { scrollY } = useScrollBehavior();
  return scrollY < threshold;
}

/**
 * Hook to detect if user is near the bottom of the page
 *
 * @param threshold - Distance from bottom in pixels (default: 10)
 * @returns true if within threshold of bottom
 */
export function useIsNearBottom(threshold = 10): boolean {
  const [isNearBottom, setIsNearBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const { scrollHeight } = document.documentElement;
      const scrollTop = window.scrollY;
      const { innerHeight: clientHeight } = window;

      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      setIsNearBottom(distanceFromBottom < threshold);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [threshold]);

  return isNearBottom;
}
