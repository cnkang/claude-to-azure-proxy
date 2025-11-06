/**
 * Type declarations for react-window
 */

declare module 'react-window' {
  import { ComponentType, Ref, CSSProperties, ReactElement } from 'react';

  export interface ListChildComponentProps {
    index: number;
    style: CSSProperties;
    data?: any;
  }

  export interface FixedSizeListProps {
    children: ComponentType<ListChildComponentProps>;
    className?: string;
    direction?: 'ltr' | 'rtl';
    height: number | string;
    initialScrollOffset?: number;
    innerElementType?: string | ComponentType<any>;
    itemCount: number;
    itemData?: any;
    itemKey?: (index: number, data: any) => any;
    itemSize: number;
    layout?: 'vertical' | 'horizontal';
    onItemsRendered?: (props: {
      overscanStartIndex: number;
      overscanStopIndex: number;
      visibleStartIndex: number;
      visibleStopIndex: number;
    }) => void;
    onScroll?: (props: {
      scrollDirection: 'forward' | 'backward';
      scrollOffset: number;
      scrollUpdateWasRequested: boolean;
    }) => void;
    outerElementType?: string | ComponentType<any>;
    outerRef?: Ref<any>;
    overscanCount?: number;
    style?: CSSProperties;
    useIsScrolling?: boolean;
    width?: number | string;
  }

  export class FixedSizeList extends React.Component<FixedSizeListProps> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(
      index: number,
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start'
    ): void;
  }

  export interface VariableSizeListProps
    extends Omit<FixedSizeListProps, 'itemSize'> {
    estimatedItemSize?: number;
    itemSize: (index: number) => number;
  }

  export class VariableSizeList extends React.Component<VariableSizeListProps> {
    resetAfterIndex(index: number, shouldForceUpdate?: boolean): void;
    scrollTo(scrollOffset: number): void;
    scrollToItem(
      index: number,
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start'
    ): void;
  }

  export interface GridChildComponentProps {
    columnIndex: number;
    rowIndex: number;
    style: CSSProperties;
    data?: any;
  }

  export interface FixedSizeGridProps {
    children: ComponentType<GridChildComponentProps>;
    className?: string;
    columnCount: number;
    columnWidth: number;
    direction?: 'ltr' | 'rtl';
    height: number | string;
    initialScrollLeft?: number;
    initialScrollTop?: number;
    innerElementType?: string | ComponentType<any>;
    itemData?: any;
    itemKey?: (props: {
      columnIndex: number;
      rowIndex: number;
      data: any;
    }) => any;
    onItemsRendered?: (props: {
      overscanColumnStartIndex: number;
      overscanColumnStopIndex: number;
      overscanRowStartIndex: number;
      overscanRowStopIndex: number;
      visibleColumnStartIndex: number;
      visibleColumnStopIndex: number;
      visibleRowStartIndex: number;
      visibleRowStopIndex: number;
    }) => void;
    onScroll?: (props: {
      horizontalScrollDirection: 'forward' | 'backward';
      scrollLeft: number;
      scrollTop: number;
      scrollUpdateWasRequested: boolean;
      verticalScrollDirection: 'forward' | 'backward';
    }) => void;
    outerElementType?: string | ComponentType<any>;
    outerRef?: Ref<any>;
    overscanColumnsCount?: number;
    overscanRowsCount?: number;
    rowCount: number;
    rowHeight: number;
    style?: CSSProperties;
    useIsScrolling?: boolean;
    width: number | string;
  }

  export class FixedSizeGrid extends React.Component<FixedSizeGridProps> {
    scrollTo(props: { scrollLeft: number; scrollTop: number }): void;
    scrollToItem(props: {
      columnIndex?: number;
      rowIndex?: number;
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start';
    }): void;
  }

  export interface VariableSizeGridProps
    extends Omit<FixedSizeGridProps, 'columnWidth' | 'rowHeight'> {
    columnWidth: (index: number) => number;
    estimatedColumnWidth?: number;
    estimatedRowHeight?: number;
    rowHeight: (index: number) => number;
  }

  export class VariableSizeGrid extends React.Component<VariableSizeGridProps> {
    resetAfterColumnIndex(
      columnIndex: number,
      shouldForceUpdate?: boolean
    ): void;
    resetAfterIndices(props: {
      columnIndex: number;
      rowIndex: number;
      shouldForceUpdate?: boolean;
    }): void;
    resetAfterRowIndex(rowIndex: number, shouldForceUpdate?: boolean): void;
    scrollTo(props: { scrollLeft: number; scrollTop: number }): void;
    scrollToItem(props: {
      columnIndex?: number;
      rowIndex?: number;
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start';
    }): void;
  }

  export function areEqual(prevProps: any, nextProps: any): boolean;
  export function shouldComponentUpdate(
    prevProps: any,
    nextProps: any
  ): boolean;
}
