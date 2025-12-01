import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user prefers reduced motion
 * Respects the prefers-reduced-motion media query for accessibility
 *
 * @returns boolean indicating if reduced motion is preferred
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if matchMedia is available
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    // Create media query
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Create event listener
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Add event listener (use addEventListener for better browser support)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}

/**
 * Get animation duration based on reduced motion preference
 * Returns 0 if reduced motion is preferred, otherwise returns the specified duration
 *
 * @param duration - The desired animation duration in milliseconds
 * @param prefersReducedMotion - Whether reduced motion is preferred
 * @returns The adjusted animation duration
 */
export function getAnimationDuration(
  duration: number,
  prefersReducedMotion: boolean
): number {
  return prefersReducedMotion ? 0 : duration;
}

/**
 * Get spring animation config based on reduced motion preference
 * Returns instant config if reduced motion is preferred
 *
 * @param config - The desired spring animation config
 * @param prefersReducedMotion - Whether reduced motion is preferred
 * @returns The adjusted spring config
 */
export function getSpringConfig(
  config: { damping: number; stiffness: number; mass?: number },
  prefersReducedMotion: boolean
): { damping: number; stiffness: number; mass?: number } {
  if (prefersReducedMotion) {
    // Return config that makes animation instant
    return {
      damping: 1,
      stiffness: 1000,
      mass: 0.1,
    };
  }
  return config;
}
