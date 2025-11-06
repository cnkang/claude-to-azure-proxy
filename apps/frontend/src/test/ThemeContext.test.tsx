import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ThemeProvider,
  useTheme,
  useThemeStyles,
  ThemeConditional,
  withTheme,
  ThemeToggle,
  _themeTransitions,
  _wcagUtils,
} from '../contexts/ThemeContext.js';

const { setThemeMock, appState, matchMediaMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  appState: {
    ui: {
      theme: 'light' as const,
      language: 'en',
    },
  },
  matchMediaMock: vi.fn(),
}));

vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: () => ({
    state: appState,
    setTheme: setThemeMock,
  }),
}));

const ThemeProbe = (): React.JSX.Element => {
  const theme = useTheme();
  return (
    <div
      data-testid="theme-context"
      data-mode={theme.themeMode}
      data-resolved={theme.resolvedTheme}
      data-system-dark={theme.systemPrefersDark}
      data-is-auto={theme.isAutoMode}
    />
  );
};

describe('ThemeContext', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    matchMediaMock.mockImplementation(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
    appState.ui.theme = 'light';
    setThemeMock.mockClear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('provides theme context values and applies document classes', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    const probe = screen.getByTestId('theme-context');
    expect(probe.dataset.mode).toBe('light');
    expect(probe.dataset.resolved).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves dark mode when system preference is dark in auto mode', () => {
    matchMediaMock.mockImplementation(() => ({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));

    appState.ui.theme = 'auto';

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    const probe = screen.getByTestId('theme-context');
    expect(probe.dataset.mode).toBe('auto');
    expect(probe.dataset.resolved).toBe('dark');
    expect(probe.dataset.systemDark).toBe('true');
  });

  it('toggleTheme updates theme via AppContext setter', () => {
    appState.ui.theme = 'dark';

    const { result, rerender } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.toggleTheme();
    });

    expect(setThemeMock).toHaveBeenCalledWith('light');

    appState.ui.theme = 'auto';
    rerender();

    act(() => {
      result.current.toggleTheme();
    });

    // When in auto mode with light resolved theme, toggling should switch to dark
    expect(setThemeMock).toHaveBeenLastCalledWith('dark');
  });

  it('useThemeStyles returns themed styling helpers', () => {
    appState.ui.theme = 'dark';

    const { result } = renderHook(() => useThemeStyles(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
    expect(result.current.themeClass).toContain('theme-dark');
  });

  it('throws when useTheme is used outside provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
  });

  it('ThemeConditional renders content based on current theme', () => {
    appState.ui.theme = 'dark';
    render(
      <ThemeProvider>
        <ThemeConditional
          light={<span data-testid="light">Light Mode</span>}
          dark={<span data-testid="dark">Dark Mode</span>}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId('dark')).toHaveTextContent('Dark Mode');

    appState.ui.theme = 'light';
    render(
      <ThemeProvider>
        <ThemeConditional
          light={<span data-testid="light">Light Mode</span>}
          dark={<span data-testid="dark">Dark Mode</span>}
        />
      </ThemeProvider>
    );

    expect(screen.getAllByText('Light Mode')).toHaveLength(1);
  });

  it('withTheme HOC injects resolved theme prop', () => {
    const Component = withTheme(
      ({ theme }: { theme: string }): React.JSX.Element => (
        <span data-testid="hoc-theme">{theme}</span>
      )
    );

    appState.ui.theme = 'auto';
    render(
      <ThemeProvider>
        <Component />
      </ThemeProvider>
    );

    expect(screen.getByTestId('hoc-theme').textContent).toBe('light');
  });

  it('ThemeToggle cycles through modes for icon and dropdown variants', () => {
    appState.ui.theme = 'light';

    const { rerender } = render(
      <ThemeProvider>
        <ThemeToggle showLabel />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /switch theme/i }));
    expect(setThemeMock).toHaveBeenCalledWith('dark');

    appState.ui.theme = 'dark';
    rerender(
      <ThemeProvider>
        <ThemeToggle variant="dropdown" />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'auto' } });
    expect(setThemeMock).toHaveBeenLastCalledWith('auto');
  });

  it('theme transition helpers add and remove classes with timers', () => {
    vi.useFakeTimers();
    const root = document.documentElement;

    _themeTransitions.fast();
    expect(root.classList.contains('theme-transition-fast')).toBe(true);

    _themeTransitions.slow();
    expect(root.classList.contains('theme-transition-slow')).toBe(true);

    _themeTransitions.disable(50);
    expect(root.classList.contains('theme-loading')).toBe(true);

    vi.runAllTimers();
    expect(root.classList.contains('theme-transition-fast')).toBe(false);
    expect(root.classList.contains('theme-transition-slow')).toBe(false);
    expect(root.classList.contains('theme-loading')).toBe(false);
    vi.useRealTimers();
  });

  it('wcag utilities compute ratios and thresholds', () => {
    const ratio = _wcagUtils.getContrastRatio('#ffffff', '#000000');
    expect(ratio).toBeGreaterThan(7);
    expect(_wcagUtils.meetsAAA(ratio)).toBe(true);
    expect(_wcagUtils.meetsAA(ratio)).toBe(true);
  });
});
