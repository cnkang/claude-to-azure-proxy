/**
 * Header Component
 *
 * Application header with navigation, theme toggle, language selector,
 * and mobile menu button.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { ThemeToggle } from '../../contexts/ThemeContext';
import { LanguageSelector } from '../../contexts/I18nContext';
import { useI18n } from '../../contexts/I18nContext';
import { Glass } from '../ui/Glass';
import { cn } from '../ui/Glass';

/**
 * Header props
 */
export interface HeaderProps {
  isMobile: boolean;
  isTablet: boolean;
}

/**
 * Header component
 */
export function Header({ isMobile, isTablet }: HeaderProps): React.JSX.Element {
  const { state, setSidebarOpen } = useAppContext();
  const { t } = useI18n();
  const isSidebarOpen = state.ui.sidebarOpen === true;

  const handleMenuToggle = (): void => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <header className="sticky top-0 z-30 w-full px-4 py-3" role="banner">
      <Glass intensity="medium" border={true} className="px-4 py-3 flex items-center justify-between">
        {/* Left section - Menu button and title */}
        <div className="flex items-center gap-4">
          {(isMobile || isTablet) && (
            <button
              type="button"
              className="p-2 -ml-2 rounded-lg hover:bg-white/10 text-gray-700 dark:text-gray-200 transition-colors"
              onClick={handleMenuToggle}
              aria-label={
                isSidebarOpen
                  ? t('header.closeSidebar')
                  : t('header.openSidebar')
              }
              aria-expanded={isSidebarOpen}
              aria-controls="sidebar"
            >
              <div className="flex flex-col gap-1.5 w-6">
                <span className="block w-full h-0.5 bg-current rounded-full" />
                <span className="block w-full h-0.5 bg-current rounded-full" />
                <span className="block w-full h-0.5 bg-current rounded-full" />
              </div>
            </button>
          )}

          <div className="flex flex-col">
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              {t('app.title')}
            </h1>
            {!isMobile && (
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {t('app.subtitle')}
              </span>
            )}
          </div>
        </div>

        {/* Right section - Controls */}
        <div className="flex items-center gap-3">
          {/* Language selector */}
          {!isMobile && (
            <div className="hidden sm:block">
              <LanguageSelector
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm hover:bg-white/20 transition-colors"
                showFlag={true}
                showNativeName={false}
              />
            </div>
          )}

          {/* Theme toggle */}
          <div>
            <ThemeToggle className="p-2 rounded-lg hover:bg-white/10 transition-colors" showLabel={!isMobile} />
          </div>

          {/* Settings button */}
          <div>
            <button
              type="button"
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-gray-700 dark:text-gray-200 transition-colors"
              aria-label={t('header.settings')}
              title={t('header.settings')}
            >
              <span className="text-lg">⚙️</span>
              {!isMobile && (
                <span className="text-sm font-medium">{t('header.settings')}</span>
              )}
            </button>
          </div>
        </div>
      </Glass>

      {/* Mobile language selector */}
      {isMobile && (
        <div className="mt-2 flex justify-end">
          <Glass intensity="low" border={true} className="inline-block">
            <LanguageSelector
              className="px-3 py-1.5 text-sm"
              showFlag={true}
              showNativeName={true}
            />
          </Glass>
        </div>
      )}
    </header>
  );
}

/**
 * Header breadcrumb component
 */
export interface BreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
    active?: boolean;
  }>;
}

export function Breadcrumb({ items }: BreadcrumbProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <nav className="flex" aria-label={t('navigation.breadcrumb')}>
      <ol className="flex items-center space-x-2">
        {items.map((item, index) => {
          const isActive = item.active === true;
          const href = item.href ?? '';
          const hasHref = href.length > 0;

          return (
            <li
              key={`breadcrumb-${index}-${item.label}`}
              className={cn(
                "flex items-center text-sm",
                isActive 
                  ? "font-semibold text-gray-900 dark:text-white" 
                  : "text-gray-700 dark:text-gray-300"
              )}
            >
              {hasHref && !isActive ? (
                <a href={href} className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  {item.label}
                </a>
              ) : (
                <span>{item.label}</span>
              )}
              {index < items.length - 1 && (
                <span className="mx-2 text-gray-700 dark:text-gray-300" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Header action button component
 */
export interface HeaderActionProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function HeaderAction({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: HeaderActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200",
        active 
          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" 
          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span className="text-lg" role="img" aria-hidden="true">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
