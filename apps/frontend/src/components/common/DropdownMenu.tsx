import React, { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react';
import './DropdownMenu.css';

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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ display: 'none' });

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
    if (!isOpen) {return;}

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
    if (!isOpen) {return;}

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex = prev + 1;
            return nextIndex >= items.length ? 0 : nextIndex;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex = prev - 1;
            return nextIndex < 0 ? items.length - 1 : nextIndex;
          });
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          const item = items[focusedIndex];
          if (item && !item.disabled) {
            item.onClick();
            onClose();
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

  return (
    <div
      ref={menuRef}
      className="dropdown-menu"
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
          className={`dropdown-menu-item ${item.variant === 'danger' ? 'danger' : ''} ${
            index === focusedIndex ? 'focused' : ''
          } ${item.disabled ? 'disabled' : ''}`}
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
          {item.icon && <span className="dropdown-menu-item-icon">{item.icon}</span>}
          <span className="dropdown-menu-item-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
};
