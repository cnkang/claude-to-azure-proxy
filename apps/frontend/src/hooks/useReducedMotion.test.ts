import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useReducedMotion,
  getAnimationDuration,
  getSpringConfig,
} from './useReducedMotion';

describe('useReducedMotion', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let mediaQueryListeners: Array<(event: MediaQueryListEvent) => void> = [];

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    mediaQueryListeners = [];
  });

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }
    mediaQueryListeners = [];
  });

  it('should return false when reduced motion is not preferred', () => {
    // Mock matchMedia to return false
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should return true when reduced motion is preferred', () => {
    // Mock matchMedia to return true
    window.matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should update when media query changes', () => {
    let currentMatches = false;

    // Mock matchMedia with event listener support
    window.matchMedia = vi.fn((query: string) => ({
      matches: currentMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(
        (event: string, handler: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            mediaQueryListeners.push(handler);
          }
        }
      ),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result, rerender } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Simulate media query change
    currentMatches = true;
    mediaQueryListeners.forEach((listener) => {
      listener({ matches: true } as MediaQueryListEvent);
    });

    rerender();
    expect(result.current).toBe(true);
  });

  it('should handle missing matchMedia gracefully', () => {
    // Remove matchMedia
    // @ts-expect-error - Testing missing matchMedia
    delete window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe('getAnimationDuration', () => {
  it('should return 0 when reduced motion is preferred', () => {
    expect(getAnimationDuration(300, true)).toBe(0);
    expect(getAnimationDuration(1000, true)).toBe(0);
  });

  it('should return original duration when reduced motion is not preferred', () => {
    expect(getAnimationDuration(300, false)).toBe(300);
    expect(getAnimationDuration(1000, false)).toBe(1000);
  });
});

describe('getSpringConfig', () => {
  it('should return instant config when reduced motion is preferred', () => {
    const config = { damping: 0.7, stiffness: 100 };
    const result = getSpringConfig(config, true);

    expect(result.damping).toBe(1);
    expect(result.stiffness).toBe(1000);
    expect(result.mass).toBe(0.1);
  });

  it('should return original config when reduced motion is not preferred', () => {
    const config = { damping: 0.7, stiffness: 100, mass: 1 };
    const result = getSpringConfig(config, false);

    expect(result).toEqual(config);
  });
});
