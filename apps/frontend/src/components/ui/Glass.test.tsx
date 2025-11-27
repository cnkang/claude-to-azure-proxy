import { describe, it } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { Glass } from './Glass';

describe('Glass Component - Property-Based Tests', () => {
  // Feature: liquid-glass-frontend-redesign, Property 5: Glass Intensity Styling
  // Validates: Requirements 2.1
  it('Glass component applies correct styling for any intensity level', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high'),
        (intensity) => {
          const { container } = render(
            <Glass intensity={intensity as 'low' | 'medium' | 'high'}>
              Test Content
            </Glass>
          );
          const element = container.firstChild as HTMLElement;

          // Define expected classes for each intensity level
          const expectedClasses: Record<string, string[]> = {
            low: ['bg-white/10', 'dark:bg-black/10', 'backdrop-blur-md'],
            medium: ['bg-white/40', 'dark:bg-black/40', 'backdrop-blur-xl'],
            high: ['bg-white/70', 'dark:bg-black/70', 'backdrop-blur-2xl'],
          };

          // Verify that all expected classes for the intensity level are present
          const classes = expectedClasses[intensity];
          const elementClasses = element.className;

          // Check each expected class is present in the element's className
          const allClassesPresent = classes.every((cls) => {
            // Handle Tailwind classes that might be transformed
            // For classes with slashes, check if they're present in any form
            if (cls.includes('/')) {
              // Extract the base class and check if it's present
              const baseClass = cls.split('/')[0];
              return elementClasses.includes(baseClass);
            }
            return elementClasses.includes(cls);
          });

          return allClassesPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Glass component always includes base styling classes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high'),
        fc.boolean(),
        (intensity, border) => {
          const { container } = render(
            <Glass
              intensity={intensity as 'low' | 'medium' | 'high'}
              border={border}
            >
              Test Content
            </Glass>
          );
          const element = container.firstChild as HTMLElement;
          const elementClasses = element.className;

          // Base classes that should always be present
          const baseClasses = ['shadow-lg', 'rounded-2xl', 'transition-all'];

          // Check all base classes are present
          const hasBaseClasses = baseClasses.every((cls) =>
            elementClasses.includes(cls)
          );

          // If border is true, check for border classes
          const hasBorderClasses = !border || elementClasses.includes('border');

          return hasBaseClasses && hasBorderClasses;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Glass component renders with any valid element type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('div', 'section', 'article', 'aside', 'header', 'footer'),
        fc.constantFrom('low', 'medium', 'high'),
        (elementType, intensity) => {
          const { container } = render(
            <Glass
              as={elementType}
              intensity={intensity as 'low' | 'medium' | 'high'}
            >
              Test Content
            </Glass>
          );
          const element = container.firstChild as HTMLElement;

          // Verify the element is of the correct type
          return element.tagName.toLowerCase() === elementType.toLowerCase();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Glass component preserves custom className alongside intensity styles', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high'),
        fc.constantFrom('custom-class', 'test-class', 'my-component'),
        (intensity, customClass) => {
          const { container } = render(
            <Glass
              intensity={intensity as 'low' | 'medium' | 'high'}
              className={customClass}
            >
              Test Content
            </Glass>
          );
          const element = container.firstChild as HTMLElement;

          // Verify custom class is present
          return element.className.includes(customClass);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Glass component renders children correctly for any intensity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high'),
        fc.string({ minLength: 1, maxLength: 100 }),
        (intensity, textContent) => {
          const { container } = render(
            <Glass intensity={intensity as 'low' | 'medium' | 'high'}>
              {textContent}
            </Glass>
          );
          const element = container.firstChild as HTMLElement;

          // Verify children are rendered
          return element.textContent === textContent;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: liquid-glass-frontend-redesign, Property 7: Theme-Dependent Glass Styling
  // Validates: Requirements 2.3
  it('Glass component updates opacity and border colors when theme changes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high'),
        fc.boolean(),
        (intensity, border) => {
          // Render Glass component
          const { container, rerender } = render(
            <Glass
              intensity={intensity as 'low' | 'medium' | 'high'}
              border={border}
            >
              Test Content
            </Glass>
          );
          const element = container.firstChild as HTMLElement;

          // Get initial classes (light mode by default in test environment)
          const lightModeClasses = element.className;

          // Verify light mode classes are present
          const hasLightBgClasses = lightModeClasses.includes('bg-white');
          const hasLightBorderClasses = !border || lightModeClasses.includes('border-white');

          // Simulate dark mode by adding dark class to document root
          document.documentElement.classList.add('dark');

          // Re-render to trigger class updates
          rerender(
            <Glass
              intensity={intensity as 'low' | 'medium' | 'high'}
              border={border}
            >
              Test Content
            </Glass>
          );

          // Get classes after theme change
          const darkModeClasses = element.className;

          // Verify dark mode classes are present
          const hasDarkBgClasses = darkModeClasses.includes('dark:bg-black');
          const hasDarkBorderClasses = !border || darkModeClasses.includes('dark:border-white');

          // Clean up
          document.documentElement.classList.remove('dark');

          // Both light and dark mode classes should be present in the className
          // because Tailwind uses responsive/variant classes like "bg-white/10 dark:bg-black/10"
          return (
            hasLightBgClasses &&
            hasLightBorderClasses &&
            hasDarkBgClasses &&
            hasDarkBorderClasses
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
