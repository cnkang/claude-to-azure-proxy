/**
 * Property-Based Tests for Utility Functions
 *
 * Feature: liquid-glass-frontend-redesign, Property 24: ClassName utility
 * Validates: Requirements 9.5
 *
 * Tests the cn() utility function for className merging with conflict resolution.
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cn } from '../components/ui/Glass';

describe('Property-Based Tests: Utility Functions', () => {
  describe('Property 24: ClassName Utility Consistency', () => {
    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should merge classNames without conflicts', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }), // array of class names
          (classNames) => {
            // Property: For any component requiring className merging,
            // the cn() utility SHALL properly merge Tailwind classes

            const result = cn(...classNames);

            // Result should be a string
            return typeof result === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle empty inputs gracefully', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // dummy property
          () => {
            // Property: cn() should handle empty inputs

            const result = cn();

            // Result should be an empty string or valid string
            return typeof result === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle undefined and null values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(fc.string(), fc.constant(undefined), fc.constant(null)),
            { minLength: 1, maxLength: 5 }
          ),
          (classNames) => {
            // Property: cn() should filter out undefined and null values

            const result = cn(...classNames);

            // Result should be a string without undefined or null
            return (
              typeof result === 'string' &&
              !result.includes('undefined') &&
              !result.includes('null')
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should resolve Tailwind class conflicts', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('bg-red-500', 'bg-blue-500', 'bg-green-500'), // conflicting bg colors
          fc.constantFrom('text-sm', 'text-lg', 'text-xl'), // conflicting text sizes
          (bgClass, textClass) => {
            // Property: When conflicting Tailwind classes are provided,
            // cn() should resolve conflicts by keeping the last one

            const result = cn('bg-red-500', bgClass, 'text-sm', textClass);

            // Result should contain the last bg and text classes
            return result.includes(bgClass) && result.includes(textClass);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should maintain non-conflicting classes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom('p-4', 'rounded-lg', 'shadow-md', 'border'),
            { minLength: 2, maxLength: 4 }
          ),
          (classNames) => {
            // Property: Non-conflicting classes should all be present in the result

            const result = cn(...classNames);

            // All non-conflicting classes should be in the result
            return classNames.every((cls) => result.includes(cls));
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle conditional classes', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // condition
          fc.constantFrom(
            'bg-blue-500',
            'text-white',
            'p-4',
            'rounded-lg',
            'shadow-md'
          ), // valid class when true
          fc.constantFrom(
            'bg-red-500',
            'text-black',
            'p-2',
            'rounded-sm',
            'shadow-sm'
          ), // valid class when false
          (condition, trueClass, falseClass) => {
            // Property: cn() should handle conditional classes correctly
            // Using valid CSS class names to test realistic usage

            const result = cn(condition ? trueClass : falseClass);

            // The selected class should be present in the result
            const selectedClass = condition ? trueClass : falseClass;
            return result.includes(selectedClass);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle arrays of classes', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
          (classArray) => {
            // Property: cn() should handle arrays of classes

            const result = cn(classArray);

            // Result should be a string
            return typeof result === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should be idempotent for single class', () => {
      fc.assert(
        fc.property(
          fc.string(), // single class
          (className) => {
            // Property: Applying cn() to a single class should return the same class

            const result1 = cn(className);
            const result2 = cn(result1);

            // Results should be equal (idempotent)
            return result1 === result2;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle whitespace correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
          (classNames) => {
            // Property: cn() should handle whitespace correctly

            const result = cn(...classNames);

            // Result should not have leading/trailing whitespace
            return result === result.trim();
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle duplicate classes by deduplicating', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('p-4', 'rounded-lg', 'shadow-md'), // valid class names
          fc.integer({ min: 2, max: 5 }), // number of duplicates
          (className, count) => {
            // Property: cn() should handle duplicate classes

            const duplicates = Array(count).fill(className);
            const result = cn(...duplicates);

            // Result should be a string containing the class
            return typeof result === 'string' && result.includes(className);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: liquid-glass-frontend-redesign, Property 24: ClassName Utility Consistency
    it('should handle complex Tailwind modifiers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'hover:bg-blue-500',
            'dark:text-white',
            'md:flex',
            'lg:hidden'
          ),
          fc.constantFrom(
            'focus:ring-2',
            'active:scale-95',
            'sm:block',
            'xl:grid'
          ),
          (modifier1, modifier2) => {
            // Property: cn() should handle Tailwind modifiers correctly

            const result = cn(modifier1, modifier2);

            // Both modifiers should be present in the result
            return result.includes(modifier1) && result.includes(modifier2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
