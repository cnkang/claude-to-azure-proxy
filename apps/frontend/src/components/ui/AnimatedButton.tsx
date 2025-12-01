/**
 * AnimatedButton Component
 * 
 * Example button component demonstrating the Liquid Glass animation system.
 * Uses framer-motion with spring physics for organic, fluid motion.
 * Automatically respects user's motion preferences (prefers-reduced-motion).
 * 
 * @example
 * ```tsx
 * <AnimatedButton onClick={handleClick} variant="primary">
 *   Click me
 * </AnimatedButton>
 * ```
 */

import { motion } from 'framer-motion';
import { useAccessibleAnimation, useAccessibleGestures } from '../../hooks/useAccessibleAnimation';
import { cn } from './Glass';

export interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button variant
   */
  variant?: 'primary' | 'secondary' | 'ghost';
  
  /**
   * Button size
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Whether the button is in a loading state
   */
  loading?: boolean;
  
  /**
   * Children content
   */
  children: React.ReactNode;
}

export function AnimatedButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: AnimatedButtonProps) {
  // Get accessible animation configuration
  const animation = useAccessibleAnimation('bouncy');
  const gestures = useAccessibleGestures();

  // Base styles
  const baseStyles = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  // Variant styles
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800',
  };

  // Size styles
  const sizeStyles = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-base',
    lg: 'h-12 px-6 text-lg',
  };

  // Extract only the safe button props to avoid conflicts with motion props
  const { 
    onClick, 
    onFocus, 
    onBlur,
    type,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedby,
    'aria-pressed': ariaPressed,
    'aria-expanded': ariaExpanded,
    id,
    name,
    value,
    form,
    formAction,
    formEncType,
    formMethod,
    formNoValidate,
    formTarget,
  } = props;

  return (
    <motion.button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      transition={animation}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      type={type}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      id={id}
      name={name}
      value={value}
      form={form}
      formAction={formAction}
      formEncType={formEncType}
      formMethod={formMethod}
      formNoValidate={formNoValidate}
      formTarget={formTarget}
      {...gestures}
    >
      {loading ? (
        <>
          <motion.div
            className="mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
            aria-hidden="true"
          />
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}
