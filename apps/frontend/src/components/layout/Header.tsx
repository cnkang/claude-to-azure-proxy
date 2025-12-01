/**
 * Header Component
 *
 * Application header with navigation, theme toggle, language selector,
 * and mobile menu button.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../../contexts/AppContext';
import { ThemeToggle } from '../../contexts/ThemeContext';
import { LanguageSelector } from '../../contexts/I18nContext';
import { useI18n } from '../../contexts/I18nContext';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/button';
import {
  Breadcrumb as ShadcnBreadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useAccessibleAnimation, useAccessibleGestures } from '../../hooks/useAccessibleAnimation';
import { useScrollBehavior } from '../../hooks/useScrollBehavior';

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
      style={{ paddingInline: 'clamp(1rem, 3vw, 2rem)' }}
      // Animate padding based on collapsed state
      animate={{ 
        paddingBlock: isCollapsed ? 'clamp(0.5rem, 1.5vw, 0.75rem)' : 'clamp(0.75rem, 2vw, 1rem)'
      }}
      transition={headerAnimation}
    >
      <GlassCard intensity="medium" border={true} className="flex items-center justify-between" style={{ paddingInline: 'clamp(1rem, 3vw, 2rem)', paddingBlock: 'clamp(0.75rem, 2vw, 1rem)', gap: 'clamp(0.75rem, 2vw, 1.5rem)' }}>
        {/* Left section - Menu button and title */}
        <div className="flex items-center" style={{ gap: 'clamp(0.75rem, 2vw, 1.5rem)' }}>
          {(isMobile || isTablet) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMenuToggle}
                    aria-label={
                      isSidebarOpen
                        ? t('header.closeSidebar')
                        : t('header.openSidebar')
                    }
                    aria-expanded={isSidebarOpen}
                    aria-controls="sidebar"
                    className={cn(
                      "text-gray-700 dark:text-gray-200",
                      "hover:bg-blue-100 dark:hover:bg-blue-900/30",
                      "hover:text-blue-600 dark:hover:text-blue-400",
                      "ring-2 ring-transparent hover:ring-blue-200 dark:hover:ring-blue-800",
                      "transition-all duration-200"
                    )}
                    asChild
                  >
                    <motion.button
                      type="button"
                      transition={animation}
                      {...gestures}
                    >
                      <div className="flex flex-col gap-1.5 w-6">
                        <motion.span 
                          className="block w-full h-0.5 bg-current rounded-full"
                          animate={{ rotate: isSidebarOpen ? 45 : 0, y: isSidebarOpen ? 6 : 0 }}
                          transition={animation}
                        />
                        <motion.span 
                          className="block w-full h-0.5 bg-current rounded-full"
                          animate={{ opacity: isSidebarOpen ? 0 : 1 }}
                          transition={animation}
                        />
                        <motion.span 
                          className="block w-full h-0.5 bg-current rounded-full"
                          animate={{ rotate: isSidebarOpen ? -45 : 0, y: isSidebarOpen ? -6 : 0 }}
                          transition={animation}
                        />
                      </div>
                    </motion.button>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                  <p>{isSidebarOpen ? t('header.closeSidebar') : t('header.openSidebar')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        <div className="flex items-center" style={{ gap: 'clamp(0.5rem, 1.5vw, 1rem)' }}>
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
          <Button
            variant="ghost"
            size={isMobile ? "icon" : "default"}
            aria-label={t('header.settings')}
            title={t('header.settings')}
            className="text-gray-700 dark:text-gray-200"
            asChild
          >
            <motion.button
              type="button"
              transition={animation}
              {...gestures}
            >
              <motion.span 
                className="text-lg"
                whileHover={{ rotate: 90 }}
                transition={animation}
              >
                ⚙️
              </motion.span>
              {!isMobile && (
                <span className="text-sm font-medium" style={{ marginInlineStart: '0.5rem' }}>{t('header.settings')}</span>
              )}
            </motion.button>
          </Button>
        </div>
      </GlassCard>

      {/* Mobile language selector */}
      {isMobile && (
        <div className="flex justify-end" style={{ marginBlockStart: '0.5rem' }}>
          <GlassCard intensity="low" border={true} className="inline-block">
            <LanguageSelector
              className="px-3 py-1.5 text-sm"
              showFlag={true}
              showNativeName={true}
            />
          </GlassCard>
        </div>
      )}
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
                  <BreadcrumbLink href={href}>
                    {item.label}
                  </BreadcrumbLink>
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
      variant={active ? "secondary" : "ghost"}
      size="default"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center",
        active 
          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" 
          : "text-gray-700 dark:text-gray-300",
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
