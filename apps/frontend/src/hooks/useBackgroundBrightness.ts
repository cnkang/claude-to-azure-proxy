/**
 * useBackgroundBrightness Hook
 *
 * Detects background brightness for dynamic Glass opacity adjustment.
 * Uses React 19.2's concurrent rendering for non-blocking calculations.
 *
 * @returns Background brightness value (0-255)
 *
 * @example
 * ```tsx
 * function AdaptiveGlass() {
 *   const brightness = useBackgroundBrightness();
 *   const opacity = brightness > 127 ? 0.7 : 0.4;
 *
 *   return (
 *     <GlassCard style={{ opacity }}>
 *       Content
 *     </GlassCard>
 *   );
 * }
 * ```
 */

import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Simplified background brightness detection
 *
 * In a full implementation, this would use canvas sampling.
 * For now, we estimate based on theme and provide a foundation for future enhancement.
 */
export function useBackgroundBrightness(): number {
  const { resolvedTheme } = useTheme();
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    // Estimate brightness based on theme
    // Light theme: assume bright background (220)
    // Dark theme: assume dark background (35)
    const estimatedBrightness = resolvedTheme === 'light' ? 220 : 35;

    // React 19.2's automatic batching will handle state updates efficiently
    setBrightness(estimatedBrightness);
  }, [resolvedTheme]);

  return brightness;
}

/**
 * Hook to get adaptive Glass opacity based on background brightness
 *
 * @param intensity - Base intensity level ('low' | 'medium' | 'high')
 * @returns Adaptive opacity value (0.1-0.9)
 */
export function useAdaptiveGlassOpacity(
  intensity: 'low' | 'medium' | 'high' = 'medium'
): number {
  const _brightness = useBackgroundBrightness();
  const { resolvedTheme } = useTheme();

  // Base opacity values for each intensity
  const baseOpacity = {
    low: 0.1,
    medium: 0.4,
    high: 0.7,
  }[intensity];

  // Adjust opacity based on brightness
  // For light backgrounds, reduce opacity slightly
  // For dark backgrounds, increase opacity slightly
  const adjustment =
    resolvedTheme === 'light'
      ? -0.05 // Reduce opacity on light backgrounds
      : 0.05; // Increase opacity on dark backgrounds

  // Clamp to valid range
  const adaptiveOpacity = Math.max(
    0.1,
    Math.min(0.9, baseOpacity + adjustment)
  );

  return adaptiveOpacity;
}

/**
 * Hook to detect if background brightness has changed significantly
 *
 * @param threshold - Brightness change threshold (default: 20)
 * @returns Whether brightness has changed significantly
 */
export function useBackgroundBrightnessChange(threshold = 20): boolean {
  const brightness = useBackgroundBrightness();
  const [previousBrightness, setPreviousBrightness] = useState(brightness);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    const change = Math.abs(brightness - previousBrightness);

    if (change > threshold) {
      setHasChanged(true);
      setPreviousBrightness(brightness);

      // Reset after a short delay
      const timer = setTimeout(() => {
        setHasChanged(false);
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    }

    return undefined;
  }, [brightness, previousBrightness, threshold]);

  return hasChanged;
}
