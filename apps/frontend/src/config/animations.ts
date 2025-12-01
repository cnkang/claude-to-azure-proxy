/**
 * Animation Configuration
 *
 * Defines spring physics presets and animation configurations for the Liquid Glass design system.
 * Based on Apple's Liquid Glass design language with organic, fluid motion.
 *
 * @see https://developer.apple.com/documentation/technologyoverviews/liquid-glass
 */

import type { Transition } from 'framer-motion';

/**
 * Spring physics presets for different animation contexts
 *
 * Values are calibrated to create organic, gel-like motion that feels alive and responsive.
 * Lower damping creates more bounce, higher stiffness creates faster motion.
 */
export const springPresets = {
  /**
   * Gentle spring - for large elements and containers
   * Smooth, calm motion with minimal bounce
   */
  gentle: {
    type: 'spring' as const,
    stiffness: 80,
    damping: 20,
    mass: 1,
  },

  /**
   * Default spring - for most interactions
   * Balanced motion with subtle bounce
   */
  default: {
    type: 'spring' as const,
    stiffness: 100,
    damping: 15,
    mass: 0.8,
  },

  /**
   * Bouncy spring - for small elements and quick feedback
   * Lively motion with noticeable bounce
   */
  bouncy: {
    type: 'spring' as const,
    stiffness: 120,
    damping: 10,
    mass: 0.5,
  },

  /**
   * Gel spring - for switches, sliders, and controls
   * Gel-like flexibility with satisfying bounce
   */
  gel: {
    type: 'spring' as const,
    stiffness: 150,
    damping: 12,
    mass: 0.6,
  },
} satisfies Record<string, Transition>;

/**
 * Duration-based transitions for when spring physics isn't appropriate
 */
export const durationPresets = {
  /**
   * Instant - no animation (for reduced motion or immediate feedback)
   */
  instant: {
    duration: 0,
  },

  /**
   * Fast - quick transitions (100ms)
   */
  fast: {
    duration: 0.1,
    ease: 'easeOut' as const,
  },

  /**
   * Normal - standard transitions (200ms)
   */
  normal: {
    duration: 0.2,
    ease: 'easeInOut' as const,
  },

  /**
   * Slow - deliberate transitions (300ms)
   */
  slow: {
    duration: 0.3,
    ease: 'easeInOut' as const,
  },
} satisfies Record<string, Transition>;

/**
 * Animation variants for common patterns
 */
export const animationVariants = {
  /**
   * Fade in/out
   */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },

  /**
   * Scale in/out (for dialogs and modals)
   */
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },

  /**
   * Slide up (for bottom sheets and notifications)
   */
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },

  /**
   * Slide down (for dropdowns and menus)
   */
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },

  /**
   * Expand (for accordions and collapsible content)
   */
  expand: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
  },
} as const;

/**
 * Gesture animation configurations
 */
export const gestureAnimations = {
  /**
   * Button press - scale down on tap
   */
  buttonPress: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
  },

  /**
   * Card hover - subtle lift effect
   */
  cardHover: {
    whileHover: { y: -2, scale: 1.01 },
  },

  /**
   * Icon button - scale and rotate
   */
  iconButton: {
    whileHover: { scale: 1.1 },
    whileTap: { scale: 0.9, rotate: 5 },
  },

  /**
   * Switch toggle - scale and shift
   */
  switchToggle: {
    whileTap: { scale: 0.95 },
  },
} as const;

/**
 * Stagger configurations for list animations
 */
export const staggerConfig = {
  /**
   * Fast stagger - 50ms delay between items
   */
  fast: {
    staggerChildren: 0.05,
    delayChildren: 0,
  },

  /**
   * Normal stagger - 100ms delay between items
   */
  normal: {
    staggerChildren: 0.1,
    delayChildren: 0.1,
  },

  /**
   * Slow stagger - 150ms delay between items
   */
  slow: {
    staggerChildren: 0.15,
    delayChildren: 0.2,
  },
} as const;

/**
 * Type exports for TypeScript
 */
export type SpringPreset = keyof typeof springPresets;
export type DurationPreset = keyof typeof durationPresets;
export type AnimationVariant = keyof typeof animationVariants;
export type GestureAnimation = keyof typeof gestureAnimations;
export type StaggerConfig = keyof typeof staggerConfig;
