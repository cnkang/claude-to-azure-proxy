/**
 * Floating Action Button Component
 *
 * A floating action button that appears in the bottom-right corner
 * with smooth animations and tooltip support.
 *
 * Requirements: 21.2, 21.7, 21.8, 21.9, 21.10
 */

import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';
import { useAccessibleAnimation } from '../../hooks/useAccessibleAnimation';
import { Button } from './button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

/**
 * Floating Action Button props
 */
export interface FloatingActionButtonProps {
  /** Click handler */
  onClick: () => void;
  /** Accessible label for screen readers and tooltip */
  label: string;
  /** Icon to display (ReactNode for flexibility) */
  icon: React.ReactNode;
  /** Whether the button is visible */
  visible: boolean;
}

/**
 * Floating Action Button component
 *
 * Displays a floating button in the bottom-right corner with:
 * - 56x56px size (exceeds 44x44px minimum touch target)
 * - Spring-based entrance/exit animations
 * - Tooltip on hover/focus
 * - WCAG AAA compliant colors and contrast
 * - Keyboard accessible
 */
export function FloatingActionButton({
  onClick,
  label,
  icon,
  visible,
}: FloatingActionButtonProps): React.JSX.Element {
  // Get accessible animation configuration with bouncy spring
  const animation = useAccessibleAnimation('bouncy');

  return (
    <AnimatePresence>
      {visible && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                className="fixed bottom-6 right-6 z-50"
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={animation}
              >
                <Button
                  onClick={onClick}
                  aria-label={label}
                  size="icon"
                  className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-lg hover:shadow-xl ring-2 ring-blue-200 dark:ring-blue-800 transition-all duration-200"
                >
                  {icon}
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </AnimatePresence>
  );
}
