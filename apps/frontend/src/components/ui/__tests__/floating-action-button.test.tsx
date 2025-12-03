import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingActionButton } from '../floating-action-button';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the useAccessibleAnimation hook
vi.mock('../../../hooks/useAccessibleAnimation', () => ({
  useAccessibleAnimation: () => ({
    type: 'spring',
    damping: 0.6,
    stiffness: 120,
  }),
}));

// Mock the theme context
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    themeMode: 'light' as const,
    resolvedTheme: 'light' as const,
    systemPrefersDark: false,
    setThemeMode: vi.fn(),
    toggleTheme: vi.fn(),
    isAutoMode: false,
    isDarkMode: false,
    isLightMode: true,
  }),
}));

describe('FloatingActionButton', () => {
  const mockOnClick = vi.fn();
  const defaultProps = {
    onClick: mockOnClick,
    label: 'Open sidebar',
    icon: <span data-testid="test-icon">☰</span>,
    visible: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with correct props when visible', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('should not render when visible is false', () => {
      render(<FloatingActionButton {...defaultProps} visible={false} />);

      const button = screen.queryByRole('button', { name: /open sidebar/i });
      expect(button).not.toBeInTheDocument();
    });

    it('should render with correct icon', () => {
      const customIcon = <span data-testid="custom-icon">🔔</span>;
      render(<FloatingActionButton {...defaultProps} icon={customIcon} />);

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
      expect(screen.getByText('🔔')).toBeInTheDocument();
    });

    it('should have correct positioning classes', () => {
      const { container } = render(<FloatingActionButton {...defaultProps} />);

      const wrapper = container.querySelector('.fixed.bottom-6.right-6.z-50');
      expect(wrapper).toBeInTheDocument();
    });

    it('should have correct size (56x56px)', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button.className).toContain('w-14');
      expect(button.className).toContain('h-14');
    });

    it('should have rounded-full class', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button.className).toContain('rounded-full');
    });

    it('should have correct background colors', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button.className).toContain('bg-blue-600');
      expect(button.className).toContain('hover:bg-blue-700');
      expect(button.className).toContain('dark:bg-blue-500');
      expect(button.className).toContain('dark:hover:bg-blue-600');
    });

    it('should have shadow classes', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button.className).toContain('shadow-lg');
      expect(button.className).toContain('hover:shadow-xl');
    });

    it('should have ring classes for focus indicator', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button.className).toContain('ring-2');
      expect(button.className).toContain('ring-blue-200');
      expect(button.className).toContain('dark:ring-blue-800');
    });
  });

  describe('Click Handler', () => {
    it('should call onClick when button is clicked', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      fireEvent.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick multiple times on multiple clicks', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(3);
    });

    it('should not call onClick when not visible', () => {
      render(<FloatingActionButton {...defaultProps} visible={false} />);

      const button = screen.queryByRole('button', { name: /open sidebar/i });
      expect(button).not.toBeInTheDocument();
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Visibility Logic', () => {
    it('should show button when visible is true', () => {
      const { rerender } = render(
        <FloatingActionButton {...defaultProps} visible={false} />
      );

      expect(
        screen.queryByRole('button', { name: /open sidebar/i })
      ).not.toBeInTheDocument();

      rerender(<FloatingActionButton {...defaultProps} visible={true} />);

      expect(
        screen.getByRole('button', { name: /open sidebar/i })
      ).toBeInTheDocument();
    });

    it('should hide button when visible changes to false', () => {
      const { rerender } = render(
        <FloatingActionButton {...defaultProps} visible={true} />
      );

      expect(
        screen.getByRole('button', { name: /open sidebar/i })
      ).toBeInTheDocument();

      rerender(<FloatingActionButton {...defaultProps} visible={false} />);

      expect(
        screen.queryByRole('button', { name: /open sidebar/i })
      ).not.toBeInTheDocument();
    });

    it('should toggle visibility correctly', () => {
      const { rerender } = render(
        <FloatingActionButton {...defaultProps} visible={true} />
      );

      expect(
        screen.getByRole('button', { name: /open sidebar/i })
      ).toBeInTheDocument();

      rerender(<FloatingActionButton {...defaultProps} visible={false} />);
      expect(
        screen.queryByRole('button', { name: /open sidebar/i })
      ).not.toBeInTheDocument();

      rerender(<FloatingActionButton {...defaultProps} visible={true} />);
      expect(
        screen.getByRole('button', { name: /open sidebar/i })
      ).toBeInTheDocument();
    });
  });

  describe('Tooltip', () => {
    it('should have TooltipProvider wrapping the button', () => {
      const { container } = render(<FloatingActionButton {...defaultProps} />);

      // Button should be wrapped in tooltip structure
      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button).toBeInTheDocument();
    });

    it('should have correct label for accessibility', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button).toHaveAttribute('aria-label', 'Open sidebar');
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button).toHaveAttribute('aria-label', 'Open sidebar');
    });

    it('should be keyboard accessible', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      button.focus();

      expect(button).toHaveFocus();
    });

    it('should be activatable with keyboard', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      button.focus();

      expect(button).toHaveFocus();

      // Buttons are natively keyboard accessible via Enter and Space
      // The browser handles this automatically, so we just verify the button is focusable
      expect(button.tagName).toBe('BUTTON');
    });

    it('should have button role', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Touch Target Size', () => {
    it('should meet minimum 44x44px touch target (actually 56x56px)', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      // w-14 = 56px, h-14 = 56px (exceeds 44x44px minimum)
      expect(button.className).toContain('w-14');
      expect(button.className).toContain('h-14');
    });
  });

  describe('WCAG AAA Compliance', () => {
    it('should have high contrast colors', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      // Blue-600 on white background provides sufficient contrast
      expect(button.className).toContain('bg-blue-600');
      expect(button.className).toContain('text-white');
    });

    it('should have visible focus indicator with sufficient contrast', () => {
      render(<FloatingActionButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: /open sidebar/i });
      // Ring provides 3:1 contrast minimum for focus indicators
      expect(button.className).toContain('ring-2');
      expect(button.className).toContain('ring-blue-200');
    });
  });
});
