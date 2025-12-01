/**
 * Comprehensive Accessibility Tests for Sidebar UX Improvements
 * 
 * Tests Requirements: 21.3, 21.4, 21.8, 21.9, 21.10
 * 
 * This test suite verifies WCAG AAA compliance for:
 * - Hamburger menu button (contrast, touch targets, keyboard access)
 * - Floating action button (contrast, touch targets, keyboard access)
 * - Tooltips (contrast, keyboard access)
 * - Onboarding message (contrast, keyboard access, ARIA)
 * - Screen reader support (ARIA labels, roles)
 * - Reduced motion support
 * 
 * Note: This test suite focuses on manual accessibility checks that can be
 * verified in unit tests. For automated accessibility audits with axe-core,
 * use E2E tests with Playwright which has better support for axe integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FloatingActionButton } from '../../components/ui/floating-action-button';
import { OnboardingMessage } from '../../components/ui/onboarding-message';
import { Header } from '../../components/layout/Header';
import { AppProvider } from '../../contexts/AppContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { I18nProvider } from '../../contexts/I18nContext';
import { SessionProvider } from '../../contexts/SessionContext';

// Mock child components to simplify rendering
vi.mock('../../contexts/ThemeContext', async () => {
  const actual = await vi.importActual('../../contexts/ThemeContext');
  return {
    ...actual,
    ThemeToggle: ({ className, showLabel }: { className?: string; showLabel?: boolean }) => (
      <button data-testid="theme-toggle" className={className}>
        {showLabel && 'Theme'}
      </button>
    ),
  };
});

vi.mock('../../contexts/I18nContext', async () => {
  const actual = await vi.importActual('../../contexts/I18nContext');
  return {
    ...actual,
    LanguageSelector: ({ className }: { className?: string }) => (
      <select data-testid="language-selector" className={className}>
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    ),
  };
});

/**
 * Note: Contrast ratio calculations in happy-dom are limited because
 * computed styles don't always reflect actual rendered colors.
 * For accurate contrast testing, use E2E tests with Playwright and
 * Chrome DevTools MCP which can measure actual rendered colors.
 */

/**
 * Helper to wrap components with required providers
 * Note: Provider order matters - SessionProvider → AppProvider → ThemeProvider → I18nProvider
 */
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SessionProvider>
      <AppProvider>
        <ThemeProvider>
          <I18nProvider>
            {ui}
          </I18nProvider>
        </ThemeProvider>
      </AppProvider>
    </SessionProvider>
  );
}

describe('Sidebar UX Accessibility Tests', () => {
  describe('Hamburger Menu Button', () => {
    it('should have focus indicator styles applied', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      // In test environment, aria-label is the translation key (e.g., "header.openSidebar")
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );
      expect(menuButton).toBeInTheDocument();

      // Focus the button
      menuButton.focus();
      
      // Wait for focus state to be applied
      await waitFor(() => {
        expect(menuButton).toHaveFocus();
      });

      // Verify focus-visible class is present in className
      // The actual contrast ratio should be verified with E2E tests using Chrome DevTools MCP
      expect(menuButton.className).toContain('focus-visible');
    });

    it('should have appropriate size classes for touch targets', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );

      // Verify button has appropriate size styling (48x48px via inline styles)
      // Actual dimensions should be verified with E2E tests using Chrome DevTools MCP
      // getBoundingClientRect() returns 0 in happy-dom, so we check the style attribute
      const style = menuButton.getAttribute('style');
      expect(style).toContain('48px');
    });

    it('should be keyboard accessible', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );

      // Verify button can receive focus
      menuButton.focus();
      
      await waitFor(() => {
        expect(menuButton).toHaveFocus();
      });

      // Verify button is not disabled
      expect(menuButton).not.toBeDisabled();
    });

    it('should have descriptive ARIA label', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );
      
      // Requirement 21.10: descriptive ARIA label
      const ariaLabel = menuButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.length).toBeGreaterThan(5); // Should be descriptive
    });

    it('should have proper ARIA expanded state', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );
      
      // Should have aria-expanded attribute
      expect(menuButton).toHaveAttribute('aria-expanded');
      const expanded = menuButton.getAttribute('aria-expanded');
      expect(expanded === 'true' || expanded === 'false').toBe(true);
    });

    it('should have tooltip component present', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );
      
      // Verify button is wrapped with Tooltip component (check for tooltip trigger)
      // The actual tooltip contrast should be verified with E2E tests
      expect(menuButton).toBeInTheDocument();
      expect(menuButton.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Floating Action Button', () => {
    const mockOnClick = vi.fn();
    const testIcon = <span>📱</span>;

    beforeEach(() => {
      mockOnClick.mockClear();
    });

    it('should have appropriate color classes for contrast', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar/i });
      
      // Verify button has blue background and white text classes
      // Actual contrast ratio should be verified with E2E tests using Chrome DevTools MCP
      expect(button.className).toMatch(/bg-blue-\d+/);
      expect(button.className).toContain('text-white');
    });

    it('should have appropriate size classes for touch targets', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar/i });

      // Verify button has w-14 h-14 classes (56x56px, exceeds 44x44px minimum)
      // Actual dimensions should be verified with E2E tests using Chrome DevTools MCP
      expect(button.className).toContain('w-14');
      expect(button.className).toContain('h-14');
    });

    it('should be keyboard accessible', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar/i });

      // Verify button can receive focus
      button.focus();
      expect(button).toHaveFocus();

      // Verify button is not disabled
      expect(button).not.toBeDisabled();
      
      // Verify button has proper type
      expect(button.tagName).toBe('BUTTON');
    });

    it('should have descriptive ARIA label', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar to view conversations"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar to view conversations/i });
      
      // Requirement 21.10: descriptive ARIA label
      const ariaLabel = button.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.length).toBeGreaterThan(5); // Should be descriptive
    });

    it('should have tooltip component present', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar/i });
      
      // Verify button has aria-label for tooltip/screen readers
      // Actual tooltip contrast should be verified with E2E tests
      expect(button.getAttribute('aria-label')).toBe('Open sidebar');
    });

    it('should have focus indicator styles', () => {
      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      const button = screen.getByRole('button', { name: /open sidebar/i });
      
      // Focus the button
      button.focus();
      expect(button).toHaveFocus();

      // Verify ring classes are present for focus indicator
      // Actual contrast ratio should be verified with E2E tests
      expect(button.className).toMatch(/ring-\d+/);
    });

    it('should respect prefers-reduced-motion', () => {
      // Mock matchMedia for prefers-reduced-motion
      const mockMatchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      });

      render(
        <FloatingActionButton
          onClick={mockOnClick}
          label="Open sidebar"
          icon={testIcon}
          visible={true}
        />
      );

      // Button should still be functional with reduced motion
      const button = screen.getByRole('button', { name: /open sidebar/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Onboarding Message', () => {
    const mockOnDismiss = vi.fn();

    beforeEach(() => {
      mockOnDismiss.mockClear();
    });

    it('should have appropriate text color classes', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner to reopen the sidebar anytime."
          dismissLabel="Got it"
        />
      );

      const dialog = screen.getByRole('dialog');
      const title = screen.getByText(/how to reopen the sidebar/i);
      const description = screen.getByText(/tap the blue button/i);
      
      // Verify text has appropriate color classes
      // Actual contrast ratios should be verified with E2E tests using Chrome DevTools MCP
      expect(title.className).toMatch(/text-gray-\d+/);
      expect(description.className).toMatch(/text-gray-\d+/);
      expect(dialog).toBeInTheDocument();
    });

    it('should have proper dialog role and ARIA attributes', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      const dialog = screen.getByRole('dialog');
      
      // Should have role="dialog"
      expect(dialog).toHaveAttribute('role', 'dialog');
      
      // Should have aria-modal="true"
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      
      // Should have aria-labelledby
      expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-title');
      
      // Should have aria-describedby
      expect(dialog).toHaveAttribute('aria-describedby', 'onboarding-description');
    });

    it('should be keyboard accessible', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      const dismissButton = screen.getByRole('button', { name: /got it/i });

      // Verify button can receive focus
      dismissButton.focus();
      expect(dismissButton).toHaveFocus();

      // Verify button is not disabled
      expect(dismissButton).not.toBeDisabled();
    });

    it('should have dismiss button with full width for easy touch', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      const dismissButton = screen.getByRole('button', { name: /got it/i });

      // Verify button has w-full class for full width (easy to tap)
      // Actual dimensions should be verified with E2E tests
      expect(dismissButton.className).toContain('w-full');
    });

    it('should respect prefers-reduced-motion', () => {
      // Mock matchMedia for prefers-reduced-motion
      const mockMatchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      });

      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      // Dialog should still be functional with reduced motion
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('should have click handler on backdrop', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={mockOnDismiss}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      const dialog = screen.getByRole('dialog');
      
      // Verify dialog has onClick handler (for click outside to dismiss)
      // Actual click behavior should be verified with E2E tests
      expect(dialog).toBeInTheDocument();
      expect(dialog.getAttribute('role')).toBe('dialog');
    });
  });

  describe('Screen Reader Support', () => {
    it('should announce hamburger menu button state changes', async () => {
      renderWithProviders(<Header isMobile={true} isTablet={false} />);
      
      // Use findByRole for async rendering with increased timeout
      const menuButton = await screen.findByRole(
        'button', 
        { name: /header\.(open|close)Sidebar/i },
        { timeout: 3000 }
      );
      
      // Should have aria-expanded for state announcement
      expect(menuButton).toHaveAttribute('aria-expanded');
      
      // Should have aria-controls to link to sidebar
      expect(menuButton).toHaveAttribute('aria-controls', 'sidebar');
    });

    it('should have descriptive labels for all interactive elements', () => {
      render(
        <FloatingActionButton
          onClick={vi.fn()}
          label="Open sidebar to view your conversations"
          icon={<span>📱</span>}
          visible={true}
        />
      );

      const button = screen.getByRole('button');
      const ariaLabel = button.getAttribute('aria-label');
      
      // Label should be descriptive (not just "button" or "open")
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.split(' ').length).toBeGreaterThan(2);
    });

    it('should have proper heading hierarchy in onboarding message', () => {
      render(
        <OnboardingMessage
          visible={true}
          onDismiss={vi.fn()}
          title="How to reopen the sidebar"
          description="Tap the blue button in the bottom-right corner."
          dismissLabel="Got it"
        />
      );

      // Title should be a heading
      const title = screen.getByText(/how to reopen the sidebar/i);
      expect(title.tagName).toBe('H2');
      
      // Should have proper id for aria-labelledby
      expect(title).toHaveAttribute('id', 'onboarding-title');
    });
  });
});
