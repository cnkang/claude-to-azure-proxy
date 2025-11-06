/**
 * Accessibility Components Index
 *
 * Exports all accessibility-related components and utilities for
 * comprehensive WCAG 2.2 AAA compliance and enhanced user experience.
 *
 * Requirements: 1.5, 10.4
 */

// Core accessibility provider
export {
  AccessibilityProvider,
  useAccessibility,
  useWCAGCompliance,
} from './AccessibilityProvider';

// Screen reader support
export {
  ScreenReaderAnnouncer,
  useScreenReaderAnnouncer,
  Announcement,
} from './ScreenReaderAnnouncer';

// Keyboard navigation
export {
  KeyboardNavigation,
  useFocusTrap,
  useRovingTabindex,
} from './KeyboardNavigation';

// Skip link for navigation
export { SkipLink } from './SkipLink';

// High contrast mode
export {
  HighContrastMode,
  HighContrastToggle,
  useHighContrastMode,
} from './HighContrastMode';

// Focus management
export { FocusManager, FocusIndicator, useFocusManager } from './FocusManager';

// Accessibility settings
export { AccessibilitySettings } from './AccessibilitySettings';

// Type exports
export type { AnnouncementProps } from './ScreenReaderAnnouncer';
export type {
  KeyboardNavigationProps,
  SkipLinkProps,
} from './KeyboardNavigation';
export type { HighContrastProps } from './HighContrastMode';
export type { FocusManagerProps } from './FocusManager';
