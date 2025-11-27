/**
 * AppLayout Component Tests
 *
 * Tests for responsive breakpoint behavior and layout functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppLayout } from './AppLayout.js';
import { AppProvider } from '../../contexts/AppContext.js';
import { ThemeProvider } from '../../contexts/ThemeContext.js';
import { I18nProvider } from '../../contexts/I18nContext.js';
import { SessionProvider } from '../../contexts/SessionContext.js';

// Mock child components
vi.mock('./Sidebar.js', () => ({
  Sidebar: ({ isOpen, isMobile }: { isOpen: boolean; isMobile: boolean }) => (
    <div data-testid="sidebar" data-open={isOpen} data-mobile={isMobile}>
      Sidebar
    </div>
  ),
}));

vi.mock('./Header.js', () => ({
  Header: ({ isMobile, isTablet }: { isMobile: boolean; isTablet: boolean }) => (
    <div data-testid="header" data-mobile={isMobile} data-tablet={isTablet}>
      Header
    </div>
  ),
}));

vi.mock('../common/ErrorBoundary.js', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../accessibility/index.js', () => ({
  AccessibilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SkipLink: () => <a href="#main-content">Skip to main content</a>,
}));

/**
 * Wrapper component with all required providers
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppProvider>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </AppProvider>
    </SessionProvider>
  );
}

describe('AppLayout - Responsive Breakpoint Behavior', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    // Store original window.innerWidth
    originalInnerWidth = window.innerWidth;
    
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920, // Desktop by default
    });
  });

  afterEach(() => {
    // Restore original window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    
    vi.clearAllMocks();
  });

  it('should detect mobile viewport (< 768px)', async () => {
    // Set mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // Mobile
    });

    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    await waitFor(() => {
      const header = screen.getByTestId('header');
      expect(header).toHaveAttribute('data-mobile', 'true');
      expect(header).toHaveAttribute('data-tablet', 'false');
    });
  });

  it('should detect tablet viewport (768px - 1024px)', async () => {
    // Set tablet viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800, // Tablet
    });

    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    await waitFor(() => {
      const header = screen.getByTestId('header');
      expect(header).toHaveAttribute('data-mobile', 'false');
      expect(header).toHaveAttribute('data-tablet', 'true');
    });
  });

  it('should detect desktop viewport (> 1024px)', async () => {
    // Set desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920, // Desktop
    });

    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    await waitFor(() => {
      const header = screen.getByTestId('header');
      expect(header).toHaveAttribute('data-mobile', 'false');
      expect(header).toHaveAttribute('data-tablet', 'false');
    });
  });

  it('should listen for resize events', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    // Verify resize event listener was added
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );

    addEventListenerSpy.mockRestore();
  });

  it('should listen for orientationchange events', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    // Verify orientationchange event listener was added
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'orientationchange',
      expect.any(Function)
    );

    addEventListenerSpy.mockRestore();
  });

  it('should render main content area', () => {
    render(
      <TestWrapper>
        <AppLayout>
          <div data-testid="test-content">Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should render skip link for accessibility', () => {
    render(
      <TestWrapper>
        <AppLayout>
          <div>Test Content</div>
        </AppLayout>
      </TestWrapper>
    );

    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });
});
