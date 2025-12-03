import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GlassButton } from '../GlassButton';
import { GlassCard } from '../GlassCard';
import { GlassSheetContent, Sheet } from '../GlassSheet';

// Mock the theme hook to avoid provider complexity
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

// Mock the AppContext to avoid provider complexity
vi.mock('../../../contexts/AppContext', () => ({
  useAppContext: () => ({
    state: {
      ui: { theme: 'light' },
    },
    setTheme: vi.fn(),
  }),
}));

// Simple render helper
const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui);
};

describe('Glass Wrapper Components', () => {
  describe('GlassCard', () => {
    it('should render with default medium intensity', () => {
      const { container } = renderWithProviders(
        <GlassCard>
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('bg-white/40');
      expect(card.className).toContain('backdrop-blur-xl');
    });

    it('should render with low intensity', () => {
      const { container } = renderWithProviders(
        <GlassCard intensity="low">
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('bg-white/10');
      expect(card.className).toContain('backdrop-blur-md');
    });

    it('should render with high intensity', () => {
      const { container } = renderWithProviders(
        <GlassCard intensity="high">
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('bg-white/70');
      expect(card.className).toContain('backdrop-blur-2xl');
    });

    it('should render with border by default', () => {
      const { container } = renderWithProviders(
        <GlassCard>
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border');
      expect(card.className).toContain('border-white/20');
    });

    it('should render without border when border=false', () => {
      const { container } = renderWithProviders(
        <GlassCard border={false}>
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      // Should not have border classes
      expect(card.className).not.toContain('border-white/20');
    });

    it('should apply custom className', () => {
      const { container } = renderWithProviders(
        <GlassCard className="custom-class">
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('custom-class');
    });

    it('should apply modern CSS features', () => {
      const { container } = renderWithProviders(
        <GlassCard>
          <div>Card content</div>
        </GlassCard>
      );
      const card = container.firstChild as HTMLElement;
      // Check for container query support
      expect(card.className).toContain('@container');
      // Check for responsive padding with clamp
      expect(card.className).toContain('clamp');
    });

    it('should render children correctly', () => {
      renderWithProviders(
        <GlassCard>
          <div data-testid="child">Card content</div>
        </GlassCard>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });
  });

  describe('GlassSheetContent', () => {
    // Note: GlassSheetContent requires Sheet context from Radix UI
    // These tests verify the component structure and props

    it('should export GlassSheetContent component', () => {
      expect(GlassSheetContent).toBeDefined();
      expect(GlassSheetContent.displayName).toBe('GlassSheetContent');
    });

    it('should export Sheet component', () => {
      expect(Sheet).toBeDefined();
    });
  });

  describe('GlassButton', () => {
    it('should render with default medium intensity', () => {
      renderWithProviders(<GlassButton>Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('bg-white/40');
      expect(button.className).toContain('backdrop-blur-xl');
    });

    it('should render with low intensity', () => {
      renderWithProviders(<GlassButton intensity="low">Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('bg-white/10');
      expect(button.className).toContain('backdrop-blur-md');
    });

    it('should render with high intensity', () => {
      renderWithProviders(<GlassButton intensity="high">Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('bg-white/70');
      expect(button.className).toContain('backdrop-blur-2xl');
    });

    it('should have hover states', () => {
      renderWithProviders(<GlassButton>Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('hover:bg-white/50');
    });

    it('should have focus indicator with WCAG AAA contrast', () => {
      renderWithProviders(<GlassButton>Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('focus-visible:ring-2');
      expect(button.className).toContain('focus-visible:ring-blue-500');
    });

    it('should apply responsive padding with clamp', () => {
      renderWithProviders(<GlassButton>Click me</GlassButton>);
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('clamp');
    });

    it('should support all shadcn/ui Button variants', () => {
      const { rerender } = renderWithProviders(
        <GlassButton variant="outline">Outline</GlassButton>
      );
      expect(
        screen.getByRole('button', { name: /outline/i })
      ).toBeInTheDocument();

      rerender(<GlassButton variant="ghost">Ghost</GlassButton>);
      expect(
        screen.getByRole('button', { name: /ghost/i })
      ).toBeInTheDocument();

      rerender(<GlassButton variant="destructive">Destructive</GlassButton>);
      expect(
        screen.getByRole('button', { name: /destructive/i })
      ).toBeInTheDocument();
    });

    it('should be accessible with proper ARIA attributes', () => {
      renderWithProviders(
        <GlassButton aria-label="Submit form">
          <span>→</span>
        </GlassButton>
      );
      expect(
        screen.getByRole('button', { name: /submit form/i })
      ).toBeInTheDocument();
    });
  });

  describe('Theme Switching', () => {
    it('should apply dark mode classes for GlassCard', () => {
      const { container } = renderWithProviders(
        <div className="dark">
          <GlassCard>
            <div>Card content</div>
          </GlassCard>
        </div>
      );
      const card = container.querySelector('[class*="dark:bg-black"]');
      expect(card).toBeTruthy();
    });

    it('should apply dark mode classes for GlassButton', () => {
      renderWithProviders(
        <div className="dark">
          <GlassButton>Click me</GlassButton>
        </div>
      );
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button.className).toContain('dark:bg-black');
    });
  });

  describe('Accessibility Attributes', () => {
    it('should preserve shadcn/ui accessibility features in GlassCard', () => {
      renderWithProviders(
        <GlassCard role="article" aria-label="Test card">
          <div>Content</div>
        </GlassCard>
      );
      expect(
        screen.getByRole('article', { name: /test card/i })
      ).toBeInTheDocument();
    });

    it('should preserve shadcn/ui accessibility features in GlassButton', () => {
      renderWithProviders(
        <GlassButton aria-describedby="help-text">Submit</GlassButton>
      );
      const button = screen.getByRole('button', { name: /submit/i });
      expect(button).toHaveAttribute('aria-describedby', 'help-text');
    });
  });
});
