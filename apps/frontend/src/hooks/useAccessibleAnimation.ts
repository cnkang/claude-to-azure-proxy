/**
 * useAccessibleAnimation Hook
 *
 * Provides animation configurations that respect user's motion preferences.
 * Automatically switches to instant transitions when prefers-reduced-motion is enabled.
 *
 * This hook combines spring physics presets with accessibility considerations,
 * ensuring animations are delightful for users who want them and instant for those who don't.
 *
 * @param preset - Spring preset to use ('gentle', 'default', 'bouncy', 'gel')
 * @returns Animation configuration (spring or instant transition)
 *
 * @example
 * ```tsx
 * function Button() {
 *   const animation = useAccessibleAnimation('bouncy');
 *
 *   return (
 *     <motion.button
 *       whileHover={{ scale: 1.05 }}
 *       whileTap={{ scale: 0.95 }}
 *       transition={animation}
 *     >
 *       Click me
 *     </motion.button>
 *   );
 * }
 * ```
 */

import { useReducedMotion } from './useReducedMotion';
import {
  springPresets,
  durationPresets,
  type SpringPreset,
} from '../config/animations';
import type { Transition } from 'framer-motion';

export function useAccessibleAnimation(
  preset: SpringPreset = 'default'
): Transition {
  const reducedMotion = useReducedMotion();

  // Return instant transition if user prefers reduced motion
  if (reducedMotion) {
    return durationPresets.instant;
  }

  // Return spring physics configuration
  return springPresets[preset];
}

/**
 * Hook to get accessible animation with custom overrides
 *
 * @param preset - Base spring preset
 * @param overrides - Custom transition properties to override
 * @returns Animation configuration with overrides applied
 *
 * @example
 * ```tsx
 * function Component() {
 *   const animation = useAccessibleAnimationWithOverrides('default', {
 *     delay: 0.1,
 *   });
 *
 *   return (
 *     <motion.div
 *       animate={{ opacity: 1 }}
 *       transition={animation}
 *     >
 *       Content
 *     </motion.div>
 *   );
 * }
 * ```
 */
export function useAccessibleAnimationWithOverrides(
  preset: SpringPreset = 'default',
  overrides: Partial<Transition> = {}
): Transition {
  const baseAnimation = useAccessibleAnimation(preset);

  return {
    ...baseAnimation,
    ...overrides,
  };
}

/**
 * Hook to get gesture animations that respect motion preferences
 *
 * @returns Gesture animation configurations or empty object if reduced motion
 *
 * @example
 * ```tsx
 * function Card() {
 *   const gestures = useAccessibleGestures();
 *
 *   return (
 *     <motion.div
 *       {...gestures.cardHover}
 *       transition={useAccessibleAnimation('gentle')}
 *     >
 *       Card content
 *     </motion.div>
 *   );
 * }
 * ```
 */
export function useAccessibleGestures() {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    // Return empty gestures if reduced motion is preferred
    return {
      whileHover: {},
      whileTap: {},
      whileFocus: {},
    };
  }

  // Return full gesture configurations
  return {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    whileFocus: { scale: 1.01 },
  };
}
