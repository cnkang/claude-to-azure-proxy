/**
 * useScrollEdge Hook
 *
 * Detects proximity to scroll edges (top/bottom) and provides visual feedback.
 * Useful for indicating when there's more content to scroll.
 *
 * @param containerRef - Ref to scrollable container
 * @param threshold - Distance from edge in pixels (default: 10)
 * @returns Scroll edge state
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { isNearTop, isNearBottom, topOpacity, bottomOpacity } = useScrollEdge(containerRef);
 */

import type React from 'react';
import { type RefObject, useEffect, useState } from 'react';

export interface ScrollEdgeState {
  /** Whether scrolled to within threshold of top */
  isNearTop: boolean;
  /** Whether scrolled to within threshold of bottom */
  isNearBottom: boolean;
  /** Opacity for top edge indicator (0-1) */
  topOpacity: number;
  /** Opacity for bottom edge indicator (0-1) */
  bottomOpacity: number;
  /** Distance from top in pixels */
  distanceFromTop: number;
  /** Distance from bottom in pixels */
  distanceFromBottom: number;
}

/**
 * Hook to detect scroll edge proximity
 */
export function useScrollEdge(
  containerRef: RefObject<HTMLElement>,
  threshold = 10
): ScrollEdgeState {
  const [edgeState, setEdgeState] = useState<ScrollEdgeState>({
    isNearTop: true,
    isNearBottom: false,
    topOpacity: 0,
    bottomOpacity: 0,
    distanceFromTop: 0,
    distanceFromBottom: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Calculate distances from edges
      const distanceFromTop = scrollTop;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

      // Determine if near edges
      const isNearTop = distanceFromTop <= threshold;
      const isNearBottom = distanceFromBottom <= threshold;

      // Calculate opacity based on distance (fade in as approaching edge)
      // Opacity is 1 at edge, 0 at threshold distance
      const topOpacity = isNearTop ? 1 - distanceFromTop / threshold : 0;

      const bottomOpacity = isNearBottom
        ? 1 - distanceFromBottom / threshold
        : 0;

      setEdgeState({
        isNearTop,
        isNearBottom,
        topOpacity: Math.max(0, Math.min(1, topOpacity)),
        bottomOpacity: Math.max(0, Math.min(1, bottomOpacity)),
        distanceFromTop,
        distanceFromBottom,
      });
    };

    // Initial check
    handleScroll();

    // Listen for scroll events
    container.addEventListener('scroll', handleScroll, { passive: true });

    // Also check on resize
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [containerRef, threshold]);

  return edgeState;
}

/**
 * Hook to get scroll edge indicator styles
 */
export function useScrollEdgeIndicator(
  containerRef: RefObject<HTMLElement>,
  threshold = 10
) {
  const edgeState = useScrollEdge(containerRef, threshold);

  const topIndicatorStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40px',
    background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent)',
    opacity: edgeState.topOpacity,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease-out',
    zIndex: 10,
  };

  const bottomIndicatorStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40px',
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.1), transparent)',
    opacity: edgeState.bottomOpacity,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease-out',
    zIndex: 10,
  };

  return {
    ...edgeState,
    topIndicatorStyle,
    bottomIndicatorStyle,
  };
}

/**
 * Component for scroll edge indicators
 */
export interface ScrollEdgeIndicatorsProps {
  containerRef: RefObject<HTMLElement>;
  threshold?: number;
  className?: string;
}

export function ScrollEdgeIndicators({
  containerRef,
  threshold = 10,
  className = '',
}: ScrollEdgeIndicatorsProps): React.ReactElement | null {
  const { isNearTop, isNearBottom, topIndicatorStyle, bottomIndicatorStyle } =
    useScrollEdgeIndicator(containerRef, threshold);

  return (
    <>
      {isNearTop && (
        <div
          className={`scroll-edge-indicator-top ${className}`}
          style={topIndicatorStyle}
          aria-hidden="true"
        />
      )}
      {isNearBottom && (
        <div
          className={`scroll-edge-indicator-bottom ${className}`}
          style={bottomIndicatorStyle}
          aria-hidden="true"
          role="status"
          aria-label="End of content"
        />
      )}
    </>
  );
}
