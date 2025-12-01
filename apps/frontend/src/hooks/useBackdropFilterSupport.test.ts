import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBackdropFilterSupport } from './useBackdropFilterSupport';

describe('useBackdropFilterSupport', () => {
  let originalCSS: typeof CSS | undefined;

  beforeEach(() => {
    originalCSS = globalThis.CSS;
  });

  afterEach(() => {
    if (originalCSS) {
      globalThis.CSS = originalCSS;
    } else {
      // @ts-expect-error - Deleting CSS for test purposes
      delete globalThis.CSS;
    }
  });

  it('should return true when backdrop-filter is supported', () => {
    // Mock CSS.supports to return true for backdrop-filter
    globalThis.CSS = {
      supports: vi.fn((property: string, value: string) => {
        return property === 'backdrop-filter' && value === 'blur(10px)';
      }),
    } as unknown as typeof CSS;

    const { result } = renderHook(() => useBackdropFilterSupport());
    expect(result.current).toBe(true);
  });

  it('should return true when -webkit-backdrop-filter is supported', () => {
    // Mock CSS.supports to return true for -webkit-backdrop-filter
    globalThis.CSS = {
      supports: vi.fn((property: string, value: string) => {
        return property === '-webkit-backdrop-filter' && value === 'blur(10px)';
      }),
    } as unknown as typeof CSS;

    const { result } = renderHook(() => useBackdropFilterSupport());
    expect(result.current).toBe(true);
  });

  it('should return false when backdrop-filter is not supported', () => {
    // Mock CSS.supports to return false
    globalThis.CSS = {
      supports: vi.fn(() => false),
    } as unknown as typeof CSS;

    const { result } = renderHook(() => useBackdropFilterSupport());
    expect(result.current).toBe(false);
  });

  it('should return false when CSS.supports is not available', () => {
    // Remove CSS object
    // @ts-expect-error - Deleting CSS for test purposes
    delete globalThis.CSS;

    const { result } = renderHook(() => useBackdropFilterSupport());
    expect(result.current).toBe(false);
  });

  it('should return false when CSS.supports is not a function', () => {
    // Mock CSS without supports method
    globalThis.CSS = {} as typeof CSS;

    const { result } = renderHook(() => useBackdropFilterSupport());
    expect(result.current).toBe(false);
  });
});
