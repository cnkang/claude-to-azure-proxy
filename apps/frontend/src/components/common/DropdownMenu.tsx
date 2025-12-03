import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { Glass, cn } from '../ui/Glass.js';

export interface DropdownMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly onClick: () => void;
  readonly variant?: 'default' | 'danger';
  readonly disabled?: boolean;
}

export interface DropdownMenuProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly anchorElement: HTMLElement | null;
  readonly items: readonly DropdownMenuItem[];
  readonly position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  isOpen,
  onClose,
  anchorElement,
  items,
  position = 'bottom-right',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    display: 'none',
  });

  // Calculate menu position based on anchor element
  const calculatePosition = useCallback((): void => {
    if (!anchorElement || !menuRef.current || !isOpen) {
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    // Calculate vertical position
    if (position.startsWith('bottom')) {
      top = anchorRect.bottom + 4;
      // Check if menu would overflow bottom of viewport
      if (top + menuRect.height > viewportHeight) {
        top = anchorRect.top - menuRect.height - 4;
      }
    } else {
      top = anchorRect.top - menuRect.height - 4;
      // Check if menu would overflow top of viewport
      if (top < 0) {
        top = anchorRect.bottom + 4;
      }
    }

    // Calculate horizontal position
    if (position.endsWith('right')) {
      left = anchorRect.right - menuRect.width;
      // Check if menu would overflow left of viewport
      if (left < 0) {
        left = anchorRect.left;
      }
    } else {
      left = anchorRect.left;
      // Check if menu would overflow right of viewport
      if (left + menuRect.width > viewportWidth) {
        left = anchorRect.right - menuRect.width;
      }
    }

    setMenuStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
    });
  }, [anchorElement, position, isOpen]);

  // Update position when menu opens or anchor changes
  useLayoutEffect(() => {
    if (isOpen) {
      calculatePosition();
    }
  }, [isOpen, calculatePosition]);

  // Handle click outside to close menu
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        anchorElement &&
        !anchorElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorElement]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          event.preventDefault();
          {
            setFocusedIndex((prev) => {
              const nextIndex = prev + 1;
              return nextIndex >= items.length ? 0 : nextIndex;
            });
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          {
            setFocusedIndex((prev) => {
              const nextIndex = prev - 1;
              return nextIndex < 0 ? items.length - 1 : nextIndex;
            });
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          {
            const item = items[focusedIndex];
            if (item && !item.disabled) {
              item.onClick();
              onClose();
            }
          }
          break;
        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusedIndex(items.length - 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, items, focusedIndex]);

  // Focus management - focus menu when opened
  useEffect(() => {
    if (isOpen && menuRef.current) {
      menuRef.current.focus();
      setFocusedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const menuContent = (
    <Glass
      ref={menuRef}
      className="min-w-[200px] py-1 z-50 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      intensity="high"
      border={true}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      style={menuStyle}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          role="menuitem"
          tabIndex={-1}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors',
            item.disabled && 'opacity-50 cursor-not-allowed',
            !item.disabled &&
              index === focusedIndex &&
              'bg-blue-50 dark:bg-blue-900/20',
            !item.disabled && item.variant === 'danger'
              ? 'text-red-700 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
          data-testid={`dropdown-item-${item.id}`}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !item.disabled) {
              e.preventDefault();
              item.onClick();
              onClose();
            }
          }}
          onMouseEnter={() => setFocusedIndex(index)}
          aria-disabled={item.disabled}
        >
          {item.icon && <span className="text-base">{item.icon}</span>}
          <span className="flex-1">{item.label}</span>
        </div>
      ))}
    </Glass>
  );

  // Use portal to render dropdown at document.body level to avoid transform context issues
  return createPortal(menuContent, document.body);
};
