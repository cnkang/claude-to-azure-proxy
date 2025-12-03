/**
 * Helper functions for ContextWarning component
 * Extracted to reduce cognitive complexity
 */

/**
 * Format token count with K/M suffixes
 */
export const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return tokens.toLocaleString();
};

/**
 * Get color classes based on warning level
 */
export const getWarningColorClasses = (
  isCritical: boolean
): {
  container: string;
  title: string;
  button: string;
  progress: string;
  text: string;
  actionButton: string;
  secondaryButton: string;
  tip: string;
} => {
  if (isCritical) {
    return {
      container:
        'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      title: 'text-red-900 dark:text-red-100',
      button: 'text-red-700 hover:bg-red-100 dark:hover:bg-red-800/50',
      progress: 'bg-red-500',
      text: 'text-red-700 dark:text-red-300',
      actionButton: 'bg-red-600 text-white hover:bg-red-700',
      secondaryButton:
        'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60',
      tip: 'bg-red-100/50 dark:bg-red-900/30 text-red-800 dark:text-red-200',
    };
  }

  return {
    container:
      'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    title: 'text-amber-900 dark:text-amber-100',
    button: 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-800/50',
    progress: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    actionButton: 'bg-amber-600 text-white hover:bg-amber-700',
    secondaryButton:
      'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60',
    tip: 'bg-amber-100/50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
  };
};

/**
 * Get indicator level based on usage percentage
 */
export const getIndicatorLevel = (
  usagePercentage: number
): 'normal' | 'warning' | 'critical' => {
  if (usagePercentage >= 95) {
    return 'critical';
  }
  if (usagePercentage >= 80) {
    return 'warning';
  }
  return 'normal';
};

/**
 * Get color classes for indicator level
 */
export const getIndicatorColorClasses = (
  level: 'normal' | 'warning' | 'critical'
): string => {
  switch (level) {
    case 'critical':
      return 'text-red-700 dark:text-red-200';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-gray-700 dark:text-gray-300';
  }
};

/**
 * Get bar color classes for indicator level
 */
export const getIndicatorBarColorClasses = (
  level: 'normal' | 'warning' | 'critical'
): string => {
  switch (level) {
    case 'critical':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    default:
      return 'bg-blue-500';
  }
};
