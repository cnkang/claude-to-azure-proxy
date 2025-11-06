/**
 * Performance Optimization Utilities
 *
 * These helpers provide typed wrappers for common debouncing,
 * throttling, memoization, and measurement scenarios used across the
 * frontend application.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type CSSProperties,
  type RefObject,
} from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown;

type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Debounce a function so it executes after the provided delay once calls stop.
 */
export function debounce<T extends AnyFunction>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: TimeoutHandle | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Throttle a function so it runs at most once per provided interval.
 */
export function throttle<T extends AnyFunction>(
  func: T,
  interval: number
): (...args: Parameters<T>) => void {
  let allowExecution = true;

  return (...args: Parameters<T>): void => {
    if (!allowExecution) {
      return;
    }

    allowExecution = false;
    func(...args);

    setTimeout(() => {
      allowExecution = true;
    }, interval);
  };
}

/**
 * React hook that returns a debounced version of a value.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return (): void => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * React hook that returns a throttled callback reference.
 */
export function useThrottledCallback<T extends AnyFunction>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const throttledRef = useRef(throttle(callback, delay));

  useEffect(() => {
    throttledRef.current = throttle(callback, delay);
  }, [callback, delay]);

  return useCallback((...args: Parameters<T>): void => {
    throttledRef.current(...args);
  }, []);
}

/**
 * Stable callback hook that preserves the original function reference between renders.
 */
export function useStableCallback<T extends AnyFunction>(callback: T): T {
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    return callbackRef.current(...args) as ReturnType<T>;
  }, []) as T;
}

/**
 * Memoise an object reference with a dependency list.
 */
export function useMemoizedObject<T extends Record<string, unknown>>(
  obj: T,
  deps: DependencyList
): T {
  return useMemo(() => obj, deps);
}

interface DeepMemoRef<T> {
  deps: DependencyList;
  value: T;
}

/**
 * Deep dependency comparison based memo hook.
 */
export function useDeepMemo<T>(factory: () => T, deps: DependencyList): T {
  const ref = useRef<DeepMemoRef<T> | null>(null);

  if (ref.current === null || !deepEqual(ref.current.deps, deps)) {
    ref.current = {
      deps: [...deps],
      value: factory(),
    };
  }

  return ref.current.value;
}

/**
 * Recursively compare two values for deep equality.
 */
function deepEqual(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) {
    return true;
  }

  if (first === null || second === null) {
    return false;
  }

  if (Array.isArray(first) && Array.isArray(second)) {
    if (first.length !== second.length) {
      return false;
    }

    const iterator = second[Symbol.iterator]();
    for (const value of first) {
      const next = iterator.next();
      if (next.done || !deepEqual(value, next.value)) {
        return false;
      }
    }

    return Boolean(iterator.next().done);
  }

  if (typeof first === 'object' && typeof second === 'object') {
    const firstRecord = first as Record<string, unknown>;
    const secondRecord = second as Record<string, unknown>;
    const entriesA = Object.entries(firstRecord);
    const keysB = Object.keys(secondRecord);

    if (entriesA.length !== keysB.length) {
      return false;
    }

    for (const [key, value] of entriesA) {
      if (!Object.prototype.hasOwnProperty.call(secondRecord, key)) {
        return false;
      }

      const otherValue = Reflect.get(secondRecord, key);
      if (!deepEqual(value, otherValue)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Observe when an element enters the viewport.
 */
export function useIntersectionObserver(
  elementRef: RefObject<Element>,
  options: IntersectionObserverInit = {}
): IntersectionObserverEntry | null {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const currentElement = elementRef.current;
    if (!(currentElement instanceof Element)) {
      return undefined;
    }

    const observer = new IntersectionObserver((observerEntries) => {
      if (observerEntries.length > 0) {
        setEntry(observerEntries[0]);
      }
    }, options);

    observer.observe(currentElement);

    return (): void => {
      observer.disconnect();
    };
  }, [elementRef, options.root, options.rootMargin, options.threshold]);

  return entry;
}

/**
 * Measure an element's width and height reactively.
 */
export function useElementSize(elementRef: RefObject<HTMLElement>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const currentElement = elementRef.current;
    if (!(currentElement instanceof HTMLElement)) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        const entry = entries[0];
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(currentElement);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [elementRef]);

  return size;
}

/**
 * Lazy loading helper hook that reveals content once visible.
 */
export function useLazyLoading(
  threshold = 0.1
): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length > 0 && entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(element);

    return (): void => {
      observer.disconnect();
    };
  }, [threshold]);

  return [ref, isVisible];
}

/**
 * Helper console reference used for development logging.
 */
const devConsole =
  typeof globalThis !== 'undefined' ? globalThis.console : undefined;

/**
 * Performance measurement helpers.
 */
export class PerformanceMonitor {
  private static readonly measurements = new Map<string, number>();

  public static startMeasurement(name: string): void {
    this.measurements.set(name, performance.now());
  }

  public static endMeasurement(name: string): number {
    const startTime = this.measurements.get(name);
    if (startTime === undefined) {
      if (devConsole) {
        devConsole.warn(`No measurement started for: ${name}`);
      }
      return 0;
    }

    const duration = performance.now() - startTime;
    this.measurements.delete(name);

    if (duration > 16 && devConsole) {
      devConsole.warn(
        `Slow operation detected: ${name} took ${duration.toFixed(2)}ms`
      );
    }

    return duration;
  }

  public static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.startMeasurement(name);
    try {
      return await fn();
    } finally {
      this.endMeasurement(name);
    }
  }

  public static measureSync<T>(name: string, fn: () => T): T {
    this.startMeasurement(name);
    try {
      return fn();
    } finally {
      this.endMeasurement(name);
    }
  }
}

interface PerformanceMemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

/**
 * Read memory usage information when available.
 */
export function getMemoryUsage(): {
  used: number;
  total: number;
  percentage: number;
} | null {
  const performanceWithMemory = performance as Performance & {
    memory?: PerformanceMemoryInfo;
  };
  const memory = performanceWithMemory.memory;

  if (!memory || memory.totalJSHeapSize === 0) {
    return null;
  }

  const { usedJSHeapSize, totalJSHeapSize } = memory;
  return {
    used: usedJSHeapSize,
    total: totalJSHeapSize,
    percentage: (usedJSHeapSize / totalJSHeapSize) * 100,
  };
}

/**
 * Notify when a component renders rapidly.
 */
export function useRenderPerformance(componentName: string): void {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = performance.now();
    const elapsed = now - lastRenderTime.current;
    lastRenderTime.current = now;

    if (renderCount.current > 1 && elapsed < 16 && devConsole) {
      devConsole.warn(
        `${componentName} rendered ${renderCount.current} times. Last render was ${elapsed.toFixed(2)}ms ago.`
      );
    }
  });
}

/**
 * Execute a list of state update callbacks.
 */
export function batchUpdates(updates: Array<() => void>): void {
  updates.forEach((update) => {
    update();
  });
}

interface VirtualListResult<T> {
  visibleItems: Array<{ item: T; index: number; style: CSSProperties }>;
  totalHeight: number;
  scrollToIndex: (index: number) => void;
}

interface UseVirtualListParams<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

/**
 * Provide a windowed list of items for efficient rendering.
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
}: UseVirtualListParams<T>): VirtualListResult<T> {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(() => {
    const windowed: Array<{ item: T; index: number; style: CSSProperties }> =
      [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      const item = items.at(index);
      if (item === undefined) {
        continue;
      }

      const style: CSSProperties = {
        position: 'absolute',
        top: index * itemHeight,
        height: itemHeight,
        width: '100%',
      };

      windowed.push({ item, index, style });
    }
    return windowed;
  }, [items, startIndex, endIndex, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const scrollToIndex = useCallback(
    (index: number): void => {
      if (index < 0 || index >= items.length) {
        return;
      }
      setScrollTop(index * itemHeight);
    },
    [itemHeight, items.length]
  );

  return {
    visibleItems,
    totalHeight,
    scrollToIndex,
  };
}
