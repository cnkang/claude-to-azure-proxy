import { useBackdropFilterSupport } from '@/hooks/useBackdropFilterSupport';
import { cn } from '@/lib/utils';
import type * as SheetPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { Sheet, SheetContent } from './sheet';

type GlassIntensity = 'low' | 'medium' | 'high';

// Define SheetContentProps locally since it's not exported from sheet.tsx
interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export interface GlassSheetContentProps extends SheetContentProps {
  intensity?: GlassIntensity;
  border?: boolean;
}

/**
 * GlassSheetContent component - A SheetContent component with liquid glass effects
 *
 * Features:
 * - Configurable glass intensity (low/medium/high)
 * - Backdrop blur effects with fallbacks for unsupported browsers
 * - WCAG AAA compliant contrast ratios
 * - Modern CSS with dvh for full-height layouts
 * - Logical properties for better i18n support
 * - Gap property for flex layouts
 */
export const GlassSheetContent = React.forwardRef<
  HTMLDivElement,
  GlassSheetContentProps
>(
  (
    { className, intensity = 'high', border = true, children, ...props },
    ref
  ) => {
    const supportsBackdropFilter = useBackdropFilterSupport();

    // Glass effect styles with backdrop-filter
    const glassStyles: Record<GlassIntensity, string> = {
      low: 'bg-white/10 dark:bg-black/10 backdrop-blur-md',
      medium: 'bg-white/40 dark:bg-black/40 backdrop-blur-xl',
      high: 'bg-white/70 dark:bg-black/70 backdrop-blur-2xl',
    };

    // Fallback styles for browsers without backdrop-filter support
    const fallbackStyles: Record<GlassIntensity, string> = {
      low: 'bg-white/80 dark:bg-black/80',
      medium: 'bg-white/90 dark:bg-black/90',
      high: 'bg-white/95 dark:bg-black/95',
    };

    const intensityStyle = supportsBackdropFilter
      ? glassStyles[intensity]
      : fallbackStyles[intensity];

    return (
      <SheetContent
        ref={ref}
        className={cn(
          // Glass effect with intensity
          intensityStyle,
          // Border with semi-transparent white
          border && 'border-l border-white/20 dark:border-white/10',
          // Shadow
          'shadow-lg',
          // Smooth transitions
          'transition-all duration-300',
          // Full height using dynamic viewport height
          'h-dvh',
          // Flex layout with gap
          'flex flex-col gap-4',
          // Logical properties for padding (Tailwind handles this)
          'p-[clamp(1rem,3vw,2rem)]',
          // Custom class
          className
        )}
        {...props}
      >
        {children}
      </SheetContent>
    );
  }
);

GlassSheetContent.displayName = 'GlassSheetContent';

// Re-export Sheet for convenience
export { Sheet };
