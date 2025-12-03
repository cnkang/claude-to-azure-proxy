/**
 * useInPlaceDialog Hook
 *
 * Calculates transform-origin for in-place dialog expansion animations.
 * Dialogs expand from the trigger button's position for a more connected feel.
 *
 * @param triggerRef - Ref to the trigger button element
 * @returns Transform origin CSS value
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   const transformOrigin = useInPlaceDialog(triggerRef);
 *
 *   return (
 *     <>
 *       <button ref={triggerRef}>Open Dialog</button>
 *       <Dialog>
 *         <DialogContent style={{ transformOrigin }}>
 *           Content
 *         </DialogContent>
 *       </Dialog>
 *     </>
 *   );
 * }
 * ```
 */

import { type RefObject, useEffect, useState } from 'react';

export interface DialogPosition {
  /** Transform origin CSS value (e.g., "100px 200px") */
  transformOrigin: string;
  /** X coordinate of trigger center */
  x: number;
  /** Y coordinate of trigger center */
  y: number;
}

/**
 * Calculate transform origin from trigger button position
 */
export function useInPlaceDialog(
  triggerRef: RefObject<HTMLElement>,
  isOpen = false
): DialogPosition {
  const [position, setPosition] = useState<DialogPosition>({
    transformOrigin: 'center center',
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    // Get trigger button's bounding rectangle
    const rect = triggerRef.current.getBoundingClientRect();

    // Calculate center coordinates
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Set transform origin to trigger button's center
    setPosition({
      transformOrigin: `${centerX}px ${centerY}px`,
      x: centerX,
      y: centerY,
    });
  }, [isOpen, triggerRef]);

  return position;
}

/**
 * Hook to get dialog animation variants based on trigger position
 */
export function useDialogAnimationVariants(position: DialogPosition) {
  return {
    initial: {
      opacity: 0,
      scale: 0,
      x: position.x,
      y: position.y,
    },
    animate: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
    },
    exit: {
      opacity: 0,
      scale: 0,
      x: position.x,
      y: position.y,
    },
  };
}
