/**
 * Virtualized List Component
 * 
 * High-performance virtualized list component for rendering large datasets
 * with minimal DOM nodes. Supports dynamic item heights and smooth scrolling.
 * 
 * Requirements: 5.4, 14.5
 */

import React, { 
  memo, 
  useCallback, 
  useEffect, 
  useRef, 
  useState, 
  useMemo,
  forwardRef,
  useImperativeHandle
} from 'react';
import { useThrottledCallback } from '../../utils/performance';

/**
 * Item renderer function type
 */
export interface VirtualizedItemRenderer<T> {
  (props: {
    item: T;
    index: number;
    style: React.CSSProperties;
    isVisible: boolean;
  }): React.ReactNode;
}

/**
 * Virtualized list props
 */
export interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  height: number;
  width?: number | string;
  overscan?: number;
  className?: string;
  renderItem: VirtualizedItemRenderer<T>;
  onScroll?: (scrollTop: number, scrollLeft: number) => void;
  scrollToIndex?: number;
  scrollToAlignment?: 'start' | 'center' | 'end' | 'auto';
  estimatedItemHeight?: number;
  getItemKey?: (item: T, index: number) => string | number;
}

/**
 * Virtualized list ref methods
 */
export interface VirtualizedListRef {
  scrollToItem: (index: number, alignment?: 'start' | 'center' | 'end' | 'auto') => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  getScrollOffset: () => number;
}

/**
 * Calculate item positions for dynamic heights
 */
function calculateItemPositions(
  itemCount: number,
  itemHeight: number | ((index: number) => number),
  estimatedHeight = 50
): { positions: number[]; totalHeight: number } {
  const positions: number[] = [];
  let currentPosition = 0;

  for (let i = 0; i < itemCount; i++) {
    positions[i] = currentPosition;
    const height = typeof itemHeight === 'function' ? itemHeight(i) : itemHeight;
    currentPosition += height || estimatedHeight;
  }

  return {
    positions,
    totalHeight: currentPosition,
  };
}

/**
 * Find visible items range
 */
function findVisibleRange(
  scrollTop: number,
  containerHeight: number,
  positions: number[],
  itemHeight: number | ((index: number) => number),
  overscan: number,
  estimatedHeight = 50
): { startIndex: number; endIndex: number } {
  const itemCount = positions.length;
  
  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  // Binary search for start index
  let startIndex = 0;
  let endIndex = itemCount - 1;
  
  while (startIndex < endIndex) {
    const mid = Math.floor((startIndex + endIndex) / 2);
    const itemTop = positions[mid];
    const itemBottom = itemTop + (
      typeof itemHeight === 'function' ? itemHeight(mid) : itemHeight
    ) || estimatedHeight;
    
    if (itemBottom <= scrollTop) {
      startIndex = mid + 1;
    } else {
      endIndex = mid;
    }
  }

  // Find end index
  const visibleStartIndex = Math.max(0, startIndex - overscan);
  let visibleEndIndex = visibleStartIndex;
  
  for (let i = visibleStartIndex; i < itemCount; i++) {
    const itemTop = positions[i];
    if (itemTop > scrollTop + containerHeight + overscan * estimatedHeight) {
      break;
    }
    visibleEndIndex = i;
  }

  return {
    startIndex: visibleStartIndex,
    endIndex: Math.min(itemCount - 1, visibleEndIndex + overscan),
  };
}

/**
 * Virtualized list component
 */
const VirtualizedListComponent = <T,>(
  {
    items,
    itemHeight,
    height,
    width = '100%',
    overscan = 5,
    className = '',
    renderItem,
    onScroll,
    scrollToIndex,
    scrollToAlignment = 'auto',
    estimatedItemHeight = 50,
    getItemKey,
  }: VirtualizedListProps<T>,
  ref: React.ForwardedRef<VirtualizedListRef>
): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate item positions
  const { positions, totalHeight } = useMemo(() => 
    calculateItemPositions(items.length, itemHeight, estimatedItemHeight),
    [items.length, itemHeight, estimatedItemHeight]
  );

  // Find visible items
  const { startIndex, endIndex } = useMemo(() =>
    findVisibleRange(scrollTop, height, positions, itemHeight, overscan, estimatedItemHeight),
    [scrollTop, height, positions, itemHeight, overscan, estimatedItemHeight]
  );

  // Throttled scroll handler
  const handleScroll = useThrottledCallback<
    (event: React.UIEvent<HTMLDivElement>) => void
  >((event) => {
    const newScrollTop = event.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set scrolling to false after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);

    onScroll?.(newScrollTop, event.currentTarget.scrollLeft);
  }, 16); // ~60fps

  // Scroll to specific index
  const scrollToItem = useCallback((
    index: number, 
    alignment: 'start' | 'center' | 'end' | 'auto' = 'auto'
  ) => {
    if (!containerRef.current || index < 0 || index >= items.length) {
      return;
    }

    const itemTop = positions[index];
    const itemBottom = itemTop + (
      typeof itemHeight === 'function' ? itemHeight(index) : itemHeight
    );
    
    let targetScrollTop = itemTop;

    switch (alignment) {
      case 'center':
        targetScrollTop = itemTop - (height - (itemBottom - itemTop)) / 2;
        break;
      case 'end':
        targetScrollTop = itemBottom - height;
        break;
      case 'auto':
        if (itemTop < scrollTop) {
          targetScrollTop = itemTop;
        } else if (itemBottom > scrollTop + height) {
          targetScrollTop = itemBottom - height;
        } else {
          return; // Item is already visible
        }
        break;
    }

    containerRef.current.scrollTop = Math.max(0, Math.min(targetScrollTop, totalHeight - height));
  }, [positions, itemHeight, height, scrollTop, totalHeight, items.length]);

  // Scroll to top/bottom
  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = totalHeight - height;
    }
  }, [totalHeight, height]);

  const getScrollOffset = useCallback(() => scrollTop, [scrollTop]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    scrollToItem,
    scrollToTop,
    scrollToBottom,
    getScrollOffset,
  }), [scrollToItem, scrollToTop, scrollToBottom, getScrollOffset]);

  // Handle scrollToIndex prop
  useEffect(() => {
    if (typeof scrollToIndex === 'number') {
      scrollToItem(scrollToIndex, scrollToAlignment);
    }
  }, [scrollToIndex, scrollToAlignment, scrollToItem]);

  // Render visible items
  const visibleItems = useMemo(() => {
    const result = [];
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (i >= items.length) {break;}
      
      const item = items[i];
      const itemTop = positions[i];
      const itemHeightValue = typeof itemHeight === 'function' ? itemHeight(i) : itemHeight;
      
      const style: React.CSSProperties = {
        position: 'absolute',
        top: itemTop,
        left: 0,
        right: 0,
        height: itemHeightValue,
        width: '100%',
      };

      const key = getItemKey ? getItemKey(item, i) : i;
      const isVisible = !isScrolling; // Hide content during fast scrolling for performance

      result.push(
        <div key={key} style={style}>
          {renderItem({ item, index: i, style, isVisible })}
        </div>
      );
    }
    
    return result;
  }, [
    startIndex, 
    endIndex, 
    items, 
    positions, 
    itemHeight, 
    renderItem, 
    getItemKey, 
    isScrolling
  ]);

  return (
    <div
      ref={containerRef}
      className={`virtualized-list ${className}`}
      style={{
        height,
        width,
        overflow: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
      role="list"
      aria-label="Virtualized list"
    >
      {/* Total height container */}
      <div
        style={{
          height: totalHeight,
          width: '100%',
          position: 'relative',
        }}
        className="virtualized-list__inner"
      >
        {visibleItems}
      </div>
      
      {/* Scrolling indicator */}
      {isScrolling && (
        <div
          className="virtualized-list-scrolling-indicator"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          Scrolling...
        </div>
      )}
    </div>
  );
};

const ForwardedVirtualizedList = forwardRef(VirtualizedListComponent);

ForwardedVirtualizedList.displayName = 'VirtualizedList';

export const VirtualizedList = memo(ForwardedVirtualizedList) as <
  T
>(
  props: VirtualizedListProps<T> & React.RefAttributes<VirtualizedListRef>
) => React.JSX.Element;

/**
 * Hook for virtualized list state management
 */
export function useVirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
}: {
  items: T[];
  itemHeight: number | ((index: number) => number);
  containerHeight: number;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const { positions, totalHeight } = useMemo(() => 
    calculateItemPositions(items.length, itemHeight),
    [items.length, itemHeight]
  );

  const { startIndex, endIndex } = useMemo(() =>
    findVisibleRange(scrollTop, containerHeight, positions, itemHeight, overscan),
    [scrollTop, containerHeight, positions, itemHeight, overscan]
  );

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1).map((item, relativeIndex) => ({
      item,
      index: startIndex + relativeIndex,
      style: {
        position: 'absolute' as const,
        top: positions[startIndex + relativeIndex],
        height: typeof itemHeight === 'function' 
          ? itemHeight(startIndex + relativeIndex) 
          : itemHeight,
        width: '100%',
      },
    }));
  }, [items, startIndex, endIndex, positions, itemHeight]);

  return {
    visibleItems,
    totalHeight,
    scrollTop,
    setScrollTop,
    startIndex,
    endIndex,
  };
}
