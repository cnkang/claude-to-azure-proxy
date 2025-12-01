/**
 * Header Component Tests
 *
 * Tests for Header component functionality, responsive behavior, and accessibility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header, Breadcrumb, HeaderAction } from './Header.js';
import { AppProvider } from '../../contexts/AppContext.js';
import { ThemeProvider } from '../../contexts/ThemeContext.js';
import { I18nProvider } from '../../contexts/I18nContext.js';
import { SessionProvider } from '../../contexts/SessionContext.js';

// Mock child components
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
    LanguageSelector: ({ className, showFlag, showNativeName }: { className?: string; showFlag?: boolean; showNativeName?: boolean }) => (
      <select data-testid="language-selector" className={className}>
        <option value="en">English {showFlag && '🇺🇸'} {showNativeName && 'English'}</option>
        <option value="zh">中文 {showFlag && '🇨🇳'} {showNativeName && '中文'}</option>
      </select>
    ),
  };
});

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

describe('Header Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render header with banner role', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
    });

    it('should render app title', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      expect(screen.getByText('app.title')).toBeInTheDocument();
    });

    it('should render subtitle on non-mobile devices', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      expect(screen.getByText('app.subtitle')).toBeInTheDocument();
    });

    it('should not render subtitle on mobile devices', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      expect(screen.queryByText('app.subtitle')).not.toBeInTheDocument();
    });

    it('should render theme toggle', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });

    it('should render settings button', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const settingsButton = screen.getByLabelText('header.settings');
      expect(settingsButton).toBeInTheDocument();
    });
  });

  describe('Mobile Menu Button', () => {
    it('should render menu button on mobile', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      const menuButton = screen.getByLabelText(/header\.(openSidebar|closeSidebar)/);
      expect(menuButton).toBeInTheDocument();
    });

    it('should render menu button on tablet', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={true} />
        </TestWrapper>
      );

      const menuButton = screen.getByLabelText(/header\.(openSidebar|closeSidebar)/);
      expect(menuButton).toBeInTheDocument();
    });

    it('should not render menu button on desktop', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const menuButton = screen.queryByLabelText(/header\.(openSidebar|closeSidebar)/);
      expect(menuButton).not.toBeInTheDocument();
    });

    it('should have proper ARIA attributes', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      const menuButton = screen.getByLabelText(/header\.(openSidebar|closeSidebar)/);
      expect(menuButton).toHaveAttribute('aria-expanded');
      expect(menuButton).toHaveAttribute('aria-controls', 'sidebar');
    });
  });

  describe('Language Selector', () => {
    it('should render language selector on desktop', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      // Desktop language selector (in header)
      const languageSelectors = screen.getAllByTestId('language-selector');
      expect(languageSelectors.length).toBeGreaterThan(0);
    });

    it('should render mobile language selector below header on mobile', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      // Mobile language selector (below header)
      const languageSelector = screen.getByTestId('language-selector');
      expect(languageSelector).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should show label on theme toggle for desktop', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const themeToggle = screen.getByTestId('theme-toggle');
      expect(themeToggle.textContent).toContain('Theme');
    });

    it('should hide label on theme toggle for mobile', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      const themeToggle = screen.getByTestId('theme-toggle');
      expect(themeToggle.textContent).not.toContain('Theme');
    });

    it('should show settings label on desktop', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const settingsButton = screen.getByLabelText('header.settings');
      expect(settingsButton.textContent).toContain('header.settings');
    });

    it('should hide settings label on mobile', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      const settingsButton = screen.getByLabelText('header.settings');
      // Should only have emoji, not text
      expect(settingsButton.textContent?.trim()).toBe('⚙️');
    });
  });

  describe('Glass Component Styling', () => {
    it('should apply Glass component with medium intensity', () => {
      const { container } = render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      // Glass component should have backdrop-blur classes
      const glassElement = container.querySelector('.backdrop-blur-xl');
      expect(glassElement).toBeInTheDocument();
    });

    it('should have border styling', () => {
      const { container } = render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      // Glass component should have border classes
      const glassElement = container.querySelector('.border');
      expect(glassElement).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(
        <TestWrapper>
          <Header isMobile={false} isTablet={false} />
        </TestWrapper>
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toBe('app.title');
    });

    it('should have accessible button labels', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      const menuButton = screen.getByLabelText(/header\.(openSidebar|closeSidebar)/);
      const settingsButton = screen.getByLabelText('header.settings');

      expect(menuButton).toBeInTheDocument();
      expect(settingsButton).toBeInTheDocument();
    });

    it('should have proper button types', () => {
      render(
        <TestWrapper>
          <Header isMobile={true} isTablet={false} />
        </TestWrapper>
      );

      // Get only the actual Header buttons (not mocked components)
      const menuButton = screen.getByLabelText(/header\.(openSidebar|closeSidebar)/);
      const settingsButton = screen.getByLabelText('header.settings');

      expect(menuButton).toHaveAttribute('type', 'button');
      expect(settingsButton).toHaveAttribute('type', 'button');
    });
  });
});

describe('Breadcrumb Component', () => {
  it('should render breadcrumb navigation', () => {
    render(
      <TestWrapper>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Settings', href: '/settings' },
            { label: 'Profile', active: true },
          ]}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('should render links for non-active items with href', () => {
    render(
      <TestWrapper>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Profile', active: true },
          ]}
        />
      </TestWrapper>
    );

    const homeLink = screen.getByText('Home');
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('should render separators between items', () => {
    const { container } = render(
      <TestWrapper>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Settings', href: '/settings' },
            { label: 'Profile', active: true },
          ]}
        />
      </TestWrapper>
    );

    // Should have 2 separators for 3 items
    // Note: shadcn/ui Breadcrumb also adds aria-hidden to the separator icons
    const separators = container.querySelectorAll('[role="presentation"]');
    expect(separators.length).toBe(2);
  });
});

describe('HeaderAction Component', () => {
  it('should render action button with icon and label', () => {
    const handleClick = vi.fn();
    
    render(
      <TestWrapper>
        <HeaderAction
          icon="🔍"
          label="Search"
          onClick={handleClick}
        />
      </TestWrapper>
    );

    const button = screen.getByLabelText('Search');
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('🔍');
    expect(button.textContent).toContain('Search');
  });

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn();
    
    render(
      <TestWrapper>
        <HeaderAction
          icon="🔍"
          label="Search"
          onClick={handleClick}
        />
      </TestWrapper>
    );

    const button = screen.getByLabelText('Search');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should apply active styling when active', () => {
    const { container } = render(
      <TestWrapper>
        <HeaderAction
          icon="🔍"
          label="Search"
          onClick={() => {}}
          active={true}
        />
      </TestWrapper>
    );

    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-blue');
  });

  it('should be disabled when disabled prop is true', () => {
    const handleClick = vi.fn();
    
    render(
      <TestWrapper>
        <HeaderAction
          icon="🔍"
          label="Search"
          onClick={handleClick}
          disabled={true}
        />
      </TestWrapper>
    );

    const button = screen.getByLabelText('Search');
    expect(button).toBeDisabled();
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
