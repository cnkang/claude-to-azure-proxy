import { useState, useEffect } from 'react';

/**
 * Hook to detect if the browser supports backdrop-filter CSS property
 * @returns boolean indicating backdrop-filter support
 */
export function useBackdropFilterSupport(): boolean {
  const [supportsBackdropFilter, setSupportsBackdropFilter] = useState(true);

  useEffect(() => {
    // Check if CSS.supports is available
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
      setSupportsBackdropFilter(false);
      return;
    }

    // Check for standard and webkit-prefixed backdrop-filter support
    const hasSupport =
      CSS.supports('backdrop-filter', 'blur(10px)') ||
      CSS.supports('-webkit-backdrop-filter', 'blur(10px)');

    setSupportsBackdropFilter(hasSupport);
  }, []);

  return supportsBackdropFilter;
}
