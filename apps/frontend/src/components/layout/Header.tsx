/**
 * Header Component
 *
 * Application header with navigation, theme toggle, language selector,
 * and mobile menu button.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import React from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { LanguageSelector } from '../../contexts/I18nContext';
import { useI18n } from '../../contexts/I18nContext';
import { ThemeToggle } from '../../contexts/ThemeContext';
import {
  useAccessibleAnimation,
  useAccessibleGestures,
} from '../../hooks/useAccessibleAnimation';
import { useScrollBehavior } from '../../hooks/useScrollBehavior';
import { GlassCard } from '../ui/GlassCard';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumb as ShadcnBreadcrumb,
} from '../ui/breadcrumb';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

/**
 * Header props
 */
export interface HeaderProps {
  isMobile: boolean;
  isTablet: boolean;
  isLandscape?: boolean;
}

/**
 * Header component
 */
export function Header({
  isMobile,
  isTablet,
  isLandscape = false,
}: HeaderProps): React.JSX.Element {
  const { state, setSidebarOpen } = useAppContext();
  const { t } = useI18n();
  const isSidebarOpen = state.ui.sidebarOpen === true;

  // Get accessible animation configuration with bouncy spring for quick feedback
  const animation = useAccessibleAnimation('bouncy');
  const gestures = useAccessibleGestures();

  // Get scroll behavior for dynamic header height
  const { isCollapsed } = useScrollBehavior();

  // Use gentle spring for smooth header transitions
  const headerAnimation = useAccessibleAnimation('gentle');

  const handleMenuToggle = (): void => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <motion.header
      className="sticky top-0 z-30 w-full"
      role="banner"
      style={{
        paddingInline: isLandscape ? '0.5rem' : 'clamp(1rem, 3vw, 2rem)',
      }}
      // Animate padding based on collapsed state and landscape mode
      animate={{
        paddingBlock: isLandscape
          ? '0.25rem'
          : isCollapsed
            ? 'clamp(0.5rem, 1.5vw, 0.75rem)'
            : 'clamp(0.75rem, 2vw, 1rem)',
      }}
      transition={headerAnimation}
    >
      <GlassCard
        intensity="medium"
        border={true}
        className="flex items-center justify-between"
        style={{
          paddingInline: isLandscape ? '0.75rem' : 'clamp(1rem, 3vw, 2rem)',
          paddingBlock: isLandscape ? '0.5rem' : 'clamp(0.75rem, 2vw, 1rem)',
          gap: isLandscape ? '0.5rem' : 'clamp(0.75rem, 2vw, 1.5rem)',
        }}
      >
        {/* Left section - Menu button and title */}
        <div
          className="flex items-center"
          style={{ gap: 'clamp(0.75rem, 2vw, 1.5rem)' }}
        >
          {(isMobile || isTablet) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    onClick={handleMenuToggle}
                    aria-label={
                      isSidebarOpen
                        ? t('header.closeSidebar')
                        : t('header.openSidebar')
                    }
                    aria-expanded={isSidebarOpen}
                    aria-controls="sidebar"
                    className={cn(
                      'p-2.5 rounded-lg',
                      'flex items-center justify-center',
                      'text-gray-700 dark:text-gray-200',
                      'hover:bg-blue-100 dark:hover:bg-blue-900/30',
                      'hover:text-blue-600 dark:hover:text-blue-400',
                      'ring-2 ring-transparent hover:ring-blue-200 dark:hover:ring-blue-800',
                      'focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                      'transition-all duration-200'
                    )}
                    style={{
                      width: '48px',
                      height: '48px',
                      minWidth: '48px',
                      minHeight: '48px',
                    }}
                    transition={animation}
                    {...gestures}
                  >
                    <div className="flex flex-col gap-1.5 w-6">
                      <motion.span
                        className="block w-full h-0.5 bg-current rounded-full"
                        animate={{
                          rotate: isSidebarOpen ? 45 : 0,
                          y: isSidebarOpen ? 6 : 0,
                        }}
                        transition={animation}
                      />
                      <motion.span
                        className="block w-full h-0.5 bg-current rounded-full"
                        animate={{ opacity: isSidebarOpen ? 0 : 1 }}
                        transition={animation}
                      />
                      <motion.span
                        className="block w-full h-0.5 bg-current rounded-full"
                        animate={{
                          rotate: isSidebarOpen ? -45 : 0,
                          y: isSidebarOpen ? -6 : 0,
                        }}
                        transition={animation}
                      />
                    </div>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                  <p>
                    {isSidebarOpen
                      ? t('header.closeSidebar')
                      : t('header.openSidebar')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <div className="flex flex-col">
            <h1
              className={cn(
                'font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400',
                isLandscape ? 'text-base' : 'text-xl'
              )}
              style={{ whiteSpace: 'nowrap' }}
            >
              {t('app.title')}
            </h1>
            {!isMobile && !isLandscape && (
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {t('app.subtitle')}
              </span>
            )}
          </div>
        </div>

        {/* Right section - Controls */}
        <div
          className="flex items-center"
          style={{
            gap: isLandscape ? '0.25rem' : 'clamp(0.5rem, 1.5vw, 1rem)',
          }}
        >
          {/* Language selector - always show in header, use compact mode on mobile */}
          <LanguageSelector
            className={cn(
              'bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors',
              isMobile || isLandscape
                ? 'px-2 py-1 text-xs'
                : 'px-3 py-1.5 text-sm'
            )}
            showFlag={!isMobile && !isLandscape}
            showNativeName={false}
            compact={isMobile || isLandscape}
          />

          {/* Theme toggle */}
          <div>
            <ThemeToggle
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              showLabel={!isMobile}
            />
          </div>

          {/* Settings button */}
          <Button
            variant="ghost"
            size={isMobile ? 'icon' : 'default'}
            aria-label={t('header.settings')}
            title={t('header.settings')}
            className="text-gray-700 dark:text-gray-200"
            asChild
          >
            <motion.button type="button" transition={animation} {...gestures}>
              <motion.span
                className="text-lg"
                whileHover={{ rotate: 90 }}
                transition={animation}
              >
                ⚙️
              </motion.span>
              {!isMobile && (
                <span
                  className="text-sm font-medium"
                  style={{ marginInlineStart: '0.5rem' }}
                >
                  {t('header.settings')}
                </span>
              )}
            </motion.button>
          </Button>
        </div>
      </GlassCard>
    </motion.header>
  );
}

/**
 * Header breadcrumb component using shadcn/ui Breadcrumb
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
    <ShadcnBreadcrumb aria-label={t('navigation.breadcrumb')}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isActive = item.active === true;
          const href = item.href ?? '';
          const hasHref = href.length > 0;

          return (
            <React.Fragment key={`breadcrumb-${index}-${item.label}`}>
              <BreadcrumbItem>
                {hasHref && !isActive ? (
                  <BreadcrumbLink href={href}>{item.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {index < items.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </ShadcnBreadcrumb>
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
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="default"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center',
        active
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300',
        className
      )}
      style={{ gap: '0.5rem' }}
    >
      <span className="text-lg" role="img" aria-hidden="true">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}
