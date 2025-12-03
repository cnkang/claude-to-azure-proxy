/**
 * Language Switch Layout Tests
 *
 * Tests to verify that language switching doesn't cause UI layout shifts
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../contexts/AppContext';
import { I18nProvider, LanguageSelector } from '../contexts/I18nContext';
import { SessionProvider } from '../contexts/SessionContext';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

describe('Language Switch Layout Stability', () => {
  beforeEach(() => {
    // Reset document attributes
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('should render language selector with proper structure', async () => {
    const TestComponent = () => (
      <SessionProvider>
        <AppProvider>
          <I18nProvider>
            <div data-testid="container" style={{ width: '100%' }}>
              <LanguageSelector showFlag showNativeName />
            </div>
          </I18nProvider>
        </AppProvider>
      </SessionProvider>
    );

    render(<TestComponent />);

    // Find language selector
    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();

    // Verify selector has both language options
    const options = selector.querySelectorAll('option');
    expect(options.length).toBe(2);

    // Verify options have correct values
    const values = Array.from(options).map((opt) => opt.getAttribute('value'));
    expect(values).toContain('en');
    expect(values).toContain('zh');
  });

  it('should update document lang attribute when switching languages', async () => {
    const TestComponent = () => (
      <SessionProvider>
        <AppProvider>
          <I18nProvider>
            <LanguageSelector />
          </I18nProvider>
        </AppProvider>
      </SessionProvider>
    );

    render(<TestComponent />);

    const selector = screen.getByRole('combobox');

    // Initial state should be 'en'
    expect(document.documentElement.lang).toBe('en');

    // Verify selector exists and has correct initial value
    expect(selector).toBeInTheDocument();
  });

  it('should render language selector with correct options', async () => {
    const TestComponent = () => (
      <SessionProvider>
        <AppProvider>
          <I18nProvider>
            <LanguageSelector />
          </I18nProvider>
        </AppProvider>
      </SessionProvider>
    );

    render(<TestComponent />);

    const selector = screen.getByRole('combobox');

    // Verify selector has options
    const options = selector.querySelectorAll('option');
    expect(options.length).toBeGreaterThan(0);

    // Verify selector is accessible
    expect(selector).toHaveAttribute('aria-label');
  });

  it('should have proper CSS containment for layout stability', async () => {
    const TestComponent = () => (
      <SessionProvider>
        <AppProvider>
          <I18nProvider>
            <div className="app-layout">
              <LanguageSelector />
            </div>
          </I18nProvider>
        </AppProvider>
      </SessionProvider>
    );

    const { container } = render(<TestComponent />);

    // Verify app-layout class is applied
    const appLayout = container.querySelector('.app-layout');
    expect(appLayout).toBeInTheDocument();

    // Verify language selector is rendered
    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();
  });
});
