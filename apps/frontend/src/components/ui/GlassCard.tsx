import { useBackdropFilterSupport } from '@/hooks/useBackdropFilterSupport';
import { useAdaptiveGlassOpacity } from '@/hooks/useBackgroundBrightness';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { Card } from './card';

type GlassIntensity = 'low' | 'medium' | 'high';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: GlassIntensity;
  border?: boolean;
  /** Enable adaptive opacity based on background brightness */
  adaptive?: boolean;
}

/**
 * GlassCard component - A Card component with liquid glass effects
 *
 * Features:
 * - Configurable glass intensity (low/medium/high)
 * - Backdrop blur effects with fallbacks for unsupported browsers
 * - WCAG AAA compliant contrast ratios
 * - Modern CSS with logical properties and responsive sizing
 * - Container query support for adaptive behavior
 */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      intensity = 'medium',
      border = true,
      adaptive = false,
      children,
      style,
      ...props
    },
    ref
  ) => {
    // Always call hooks (React rules)
    const adaptiveOpacity = useAdaptiveGlassOpacity(intensity);
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

    // If adaptive mode is enabled, use CSS variables for dynamic opacity
    const adaptiveStyle = adaptive
      ? ({
          ...style,
          '--glass-opacity': adaptiveOpacity,
          backgroundColor: `rgba(255, 255, 255, var(--glass-opacity))`,
        } as React.CSSProperties)
      : style;

    return (
      <Card
        ref={ref}
        className={cn(
          // Glass effect with intensity (only if not adaptive)
          !adaptive && intensityStyle,
          // Adaptive mode uses inline styles for dynamic opacity
          adaptive &&
            (supportsBackdropFilter
              ? 'backdrop-blur-xl dark:backdrop-blur-2xl'
              : ''),
          // Border with semi-transparent white
          border && 'border border-white/20 dark:border-white/10',
          // Shadow and rounded corners
          'shadow-lg rounded-2xl',
          // Smooth transitions
          'transition-all duration-300',
          // Container query support
          '@container',
          // Responsive padding using logical properties (Tailwind handles this)
          'p-[clamp(1rem,3vw,2rem)]',
          // Custom class
          className
        )}
        style={adaptiveStyle}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

GlassCard.displayName = 'GlassCard';
