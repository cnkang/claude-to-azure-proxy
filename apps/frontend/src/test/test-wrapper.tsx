/**
 * Test Wrapper Component
 * 
 * Provides necessary context providers for testing components
 * that depend on i18n, theme, or other global contexts.
 */

import React from 'react';
import { I18nProvider } from '../contexts/I18nContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AppProvider } from '../contexts/AppContext';
import { SessionProvider } from '../contexts/SessionContext';

interface TestWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that provides all necessary contexts for testing
 */
export const TestWrapper: React.FC<TestWrapperProps> = ({ children }) => {
  return (
    <SessionProvider>
      <AppProvider>
        <ThemeProvider>
          <I18nProvider>
            {children}
          </I18nProvider>
        </ThemeProvider>
      </AppProvider>
    </SessionProvider>
  );
};

/**
 * Custom render function that includes all necessary providers
 */
export const renderWithProviders = (ui: React.ReactElement) => {
  return (
    <TestWrapper>
      {ui}
    </TestWrapper>
  );
};