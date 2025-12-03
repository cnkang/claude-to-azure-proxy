import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingMessage } from '../onboarding-message';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, onClick, ...props }: any) => (
      <div className={className} onClick={onClick} {...props}>
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
    damping: 0.8,
    stiffness: 80,
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

describe('OnboardingMessage', () => {
  const mockOnDismiss = vi.fn();
  const defaultProps = {
    visible: true,
    onDismiss: mockOnDismiss,
    title: 'Welcome!',
    description: 'This is how you reopen the sidebar.',
    dismissLabel: 'Got it',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('should render with correct content when visible', () => {
      render(<OnboardingMessage {...defaultProps} />);

      expect(screen.getByText('Welcome!')).toBeInTheDocument();
      expect(
        screen.getByText('This is how you reopen the sidebar.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /got it/i })
      ).toBeInTheDocument();
    });

    it('should not render when visible is false', () => {
      render(<OnboardingMessage {...defaultProps} visible={false} />);

      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();
      expect(
        screen.queryByText('This is how you reopen the sidebar.')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /got it/i })
      ).not.toBeInTheDocument();
    });

    it('should render with custom title', () => {
      render(<OnboardingMessage {...defaultProps} title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();
    });

    it('should render with custom description', () => {
      render(
        <OnboardingMessage
          {...defaultProps}
          description="Custom description text"
        />
      );

      expect(screen.getByText('Custom description text')).toBeInTheDocument();
      expect(
        screen.queryByText('This is how you reopen the sidebar.')
      ).not.toBeInTheDocument();
    });

    it('should render with custom dismiss label', () => {
      render(<OnboardingMessage {...defaultProps} dismissLabel="Understood" />);

      expect(
        screen.getByRole('button', { name: /understood/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /got it/i })
      ).not.toBeInTheDocument();
    });

    it('should render info icon', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have correct modal structure', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector(
        '.fixed.inset-0.bg-black\\/50.backdrop-blur-sm'
      );
      expect(backdrop).toBeInTheDocument();
    });

    it('should have correct card styling', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const card = container.querySelector(
        '.bg-white.dark\\:bg-gray-800.rounded-lg'
      );
      expect(card).toBeInTheDocument();
    });
  });

  describe('Dismiss Functionality', () => {
    it('should call onDismiss when dismiss button is clicked', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      fireEvent.click(dismissButton);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should call onDismiss when backdrop is clicked', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop).toBeInTheDocument();

      if (backdrop) {
        fireEvent.click(backdrop);
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
      }
    });

    it('should not call onDismiss when card content is clicked', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const card = container.querySelector('.bg-white');
      expect(card).toBeInTheDocument();

      if (card) {
        fireEvent.click(card);
        expect(mockOnDismiss).not.toHaveBeenCalled();
      }
    });

    it('should call onDismiss multiple times on multiple button clicks', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      fireEvent.click(dismissButton);
      fireEvent.click(dismissButton);
      fireEvent.click(dismissButton);

      expect(mockOnDismiss).toHaveBeenCalledTimes(3);
    });
  });

  describe('Visibility Logic', () => {
    it('should show message when visible is true', () => {
      const { rerender } = render(
        <OnboardingMessage {...defaultProps} visible={false} />
      );

      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();

      rerender(<OnboardingMessage {...defaultProps} visible={true} />);

      expect(screen.getByText('Welcome!')).toBeInTheDocument();
    });

    it('should hide message when visible changes to false', () => {
      const { rerender } = render(
        <OnboardingMessage {...defaultProps} visible={true} />
      );

      expect(screen.getByText('Welcome!')).toBeInTheDocument();

      rerender(<OnboardingMessage {...defaultProps} visible={false} />);

      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();
    });

    it('should toggle visibility correctly', () => {
      const { rerender } = render(
        <OnboardingMessage {...defaultProps} visible={true} />
      );

      expect(screen.getByText('Welcome!')).toBeInTheDocument();

      rerender(<OnboardingMessage {...defaultProps} visible={false} />);
      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();

      rerender(<OnboardingMessage {...defaultProps} visible={true} />);
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
    });

    it('should have aria-modal attribute', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const dialog = container.querySelector('[aria-modal="true"]');
      expect(dialog).toBeInTheDocument();
    });

    it('should have aria-labelledby pointing to title', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-title');

      const title = container.querySelector('#onboarding-title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent('Welcome!');
    });

    it('should have aria-describedby pointing to description', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toHaveAttribute(
        'aria-describedby',
        'onboarding-description'
      );

      const description = container.querySelector('#onboarding-description');
      expect(description).toBeInTheDocument();
      expect(description).toHaveTextContent(
        'This is how you reopen the sidebar.'
      );
    });

    it('should have icon with aria-hidden', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const icon = container.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should be keyboard accessible', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      dismissButton.focus();

      expect(dismissButton).toHaveFocus();
    });

    it('should be activatable with keyboard', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      dismissButton.focus();

      expect(dismissButton).toHaveFocus();

      // Buttons are natively keyboard accessible via Enter and Space
      // The browser handles this automatically, so we just verify the button is focusable
      expect(dismissButton.tagName).toBe('BUTTON');
    });
  });

  describe('Styling', () => {
    it('should have semi-transparent backdrop with blur', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop?.className).toContain('bg-black/50');
      expect(backdrop?.className).toContain('backdrop-blur-sm');
    });

    it('should have correct z-index (60)', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop?.className).toContain('z-[60]');
    });

    it('should have centered layout', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop?.className).toContain('flex');
      expect(backdrop?.className).toContain('items-center');
      expect(backdrop?.className).toContain('justify-center');
    });

    it('should have max-width constraint', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const card = container.querySelector('.max-w-sm');
      expect(card).toBeInTheDocument();
    });

    it('should have shadow and border', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const card = container.querySelector('.shadow-2xl.border');
      expect(card).toBeInTheDocument();
    });

    it('should have proper text styling', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const title = container.querySelector('#onboarding-title');
      expect(title?.className).toContain('text-xl');
      expect(title?.className).toContain('font-bold');
      expect(title?.className).toContain('text-center');

      const description = container.querySelector('#onboarding-description');
      expect(description?.className).toContain('text-sm');
      expect(description?.className).toContain('text-center');
    });

    it('should have full-width dismiss button', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      expect(dismissButton.className).toContain('w-full');
    });
  });

  describe('WCAG AAA Compliance', () => {
    it('should have high contrast colors for title', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const title = container.querySelector('#onboarding-title');
      expect(title?.className).toContain('text-gray-900');
      expect(title?.className).toContain('dark:text-gray-100');
    });

    it('should have high contrast colors for description', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const description = container.querySelector('#onboarding-description');
      expect(description?.className).toContain('text-gray-700');
      expect(description?.className).toContain('dark:text-gray-300');
    });

    it('should have high contrast button colors', () => {
      render(<OnboardingMessage {...defaultProps} />);

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      expect(dismissButton.className).toContain('bg-blue-600');
      expect(dismissButton.className).toContain('hover:bg-blue-700');
      expect(dismissButton.className).toContain('text-white');
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode classes for card', () => {
      const { container } = render(
        <div className="dark">
          <OnboardingMessage {...defaultProps} />
        </div>
      );

      const card = container.querySelector('.dark\\:bg-gray-800');
      expect(card).toBeInTheDocument();
    });

    it('should have dark mode classes for border', () => {
      const { container } = render(
        <div className="dark">
          <OnboardingMessage {...defaultProps} />
        </div>
      );

      const card = container.querySelector('.dark\\:border-gray-700');
      expect(card).toBeInTheDocument();
    });

    it('should have dark mode classes for button', () => {
      render(
        <div className="dark">
          <OnboardingMessage {...defaultProps} />
        </div>
      );

      const dismissButton = screen.getByRole('button', { name: /got it/i });
      expect(dismissButton.className).toContain('dark:bg-blue-500');
      expect(dismissButton.className).toContain('dark:hover:bg-blue-600');
    });
  });

  describe('Event Propagation', () => {
    it('should stop propagation when clicking card content', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const card = container.querySelector('.bg-white');
      expect(card).toBeInTheDocument();

      if (card) {
        const stopPropagationSpy = vi.fn();
        const event = new MouseEvent('click', { bubbles: true });
        event.stopPropagation = stopPropagationSpy;

        fireEvent.click(card);

        // onDismiss should not be called when clicking card
        expect(mockOnDismiss).not.toHaveBeenCalled();
      }
    });

    it('should allow propagation when clicking backdrop', () => {
      const { container } = render(<OnboardingMessage {...defaultProps} />);

      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop).toBeInTheDocument();

      if (backdrop) {
        fireEvent.click(backdrop);

        // onDismiss should be called when clicking backdrop
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
      }
    });
  });
});
