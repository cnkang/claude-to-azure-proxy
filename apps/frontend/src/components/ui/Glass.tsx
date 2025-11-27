import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type GlassIntensity = 'low' | 'medium' | 'high';

type GlassProps<T extends React.ElementType> = {
  as?: T;
  intensity?: GlassIntensity;
  border?: boolean;
  children?: React.ReactNode;
} & React.ComponentPropsWithoutRef<T>;

export const Glass = React.forwardRef<HTMLDivElement, GlassProps<React.ElementType>>(
  ({ as: Component = 'div', className, intensity = 'medium', border = true, children, ...props }, ref) => {
    const intensityStyles: Record<GlassIntensity, string> = {
      low: 'bg-white/10 dark:bg-black/10 backdrop-blur-md',
      medium: 'bg-white/40 dark:bg-black/40 backdrop-blur-xl',
      high: 'bg-white/70 dark:bg-black/70 backdrop-blur-2xl',
    };

    return (
      <Component
        ref={ref}
        className={cn(
          intensityStyles[intensity as GlassIntensity],
          border && 'border border-white/20 dark:border-white/10',
          'shadow-lg rounded-2xl transition-all duration-300',
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Glass.displayName = 'Glass';
