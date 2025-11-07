declare module 'react-window' {
  import { ComponentType, CSSProperties, ReactElement, Component } from 'react';

  export interface ListProps {
    children: ComponentType<ListChildComponentProps>;
    className?: string;
    height: number | string;
    itemCount: number;
    itemSize: number | ((index: number) => number);
    itemData?: any;
    width?: number | string;
    onScroll?: (props: {
      scrollOffset: number;
      scrollUpdateWasRequested: boolean;
    }) => void;
  }

  export interface ListChildComponentProps {
    index: number;
    style: CSSProperties;
    data?: any;
  }

  export class List extends Component<ListProps> {
    scrollToItem(
      index: number,
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start'
    ): void;
  }

  export interface GridProps {
    children: ComponentType<any>;
    className?: string;
    columnCount: number;
    columnWidth: number | ((index: number) => number);
    height: number | string;
    rowCount: number;
    rowHeight: number | ((index: number) => number);
    width?: number | string;
  }

  export class Grid extends Component<GridProps> {}
}
