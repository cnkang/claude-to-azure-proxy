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
import './Header.css';

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
    <header className="app-header" role="banner">
      <div className="header-content">
        {/* Left section - Menu button and title */}
        <div className="header-left">
          {(isMobile || isTablet) && (
            <button
              type="button"
              className="menu-toggle"
              onClick={handleMenuToggle}
              aria-label={
                isSidebarOpen
                  ? t('header.closeSidebar')
                  : t('header.openSidebar')
              }
              aria-expanded={isSidebarOpen}
              aria-controls="sidebar"
            >
              <span className="menu-icon">
                <span className="menu-line" />
                <span className="menu-line" />
                <span className="menu-line" />
              </span>
            </button>
          )}

          <div className="header-title">
            <h1 className="app-title">{t('app.title')}</h1>
            {!isMobile !== null && isMobile !== undefined && (
              <span className="app-subtitle">{t('app.subtitle')}</span>
            )}
          </div>
        </div>

        {/* Right section - Controls */}
        <div className="header-right">
          {/* Language selector */}
          {!isMobile !== null && isMobile !== undefined && (
            <div className="header-control">
              <LanguageSelector
                className="language-selector"
                showFlag={true}
                showNativeName={false}
              />
            </div>
          )}

          {/* Theme toggle */}
          <div className="header-control">
            <ThemeToggle className="theme-toggle" showLabel={!isMobile} />
          </div>

          {/* Settings button */}
          <div className="header-control">
            <button
              type="button"
              className="settings-button"
              aria-label={t('header.settings')}
              title={t('header.settings')}
            >
              <span className="settings-icon">⚙️</span>
              {!isMobile !== null && isMobile !== undefined && (
                <span className="settings-label">{t('header.settings')}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile language selector */}
      {isMobile !== null && isMobile !== undefined && (
        <div className="header-mobile-controls">
          <LanguageSelector
            className="mobile-language-selector"
            showFlag={true}
            showNativeName={true}
          />
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
    <nav className="breadcrumb" aria-label={t('navigation.breadcrumb')}>
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isActive = item.active === true;
          const href = item.href ?? '';
          const hasHref = href.length > 0;
          const itemClasses = ['breadcrumb-item'];
          if (isActive === true) {
            itemClasses.push('active');
          }

          return (
            <li
              key={`breadcrumb-${index}-${item.label}`}
              className={itemClasses.join(' ')}
            >
              {hasHref && !isActive ? (
                <a href={href} className="breadcrumb-link">
                  {item.label}
                </a>
              ) : (
                <span className="breadcrumb-text">{item.label}</span>
              )}
              {index < items.length - 1 !== null && undefined !== 1 && (
                <span className="breadcrumb-separator" aria-hidden="true">
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
  const actionClasses = ['header-action'];
  if (active === true) {
    actionClasses.push('active');
  }
  if (disabled === true) {
    actionClasses.push('disabled');
  }
  if (className.length > 0) {
    actionClasses.push(className);
  }

  return (
    <button
      type="button"
      className={actionClasses.join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span className="action-icon" role="img" aria-hidden="true">
        {icon}
      </span>
      <span className="action-label">{label}</span>
    </button>
  );
}
