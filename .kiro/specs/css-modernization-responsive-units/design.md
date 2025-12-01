# Design Document

## Overview

This design document outlines the architecture and implementation strategy for refactoring the frontend application's styling layer to use modern, responsive CSS features and relative units instead of fixed `px` values. The refactor maintains full compatibility with React 19.2, Tailwind CSS 4.1, and shadcn/ui while ensuring WCAG 2.2 AAA accessibility compliance and preserving the current visual design and interaction behavior.

The refactor focuses on:

1. **Relative Units**: Converting fixed px values to rem, em, %, vh, vw, fr, and modern viewport units (dvh, lvh, svh)
2. **Modern Layout Systems**: Replacing legacy layouts with flexbox, grid, gap, and modern alignment properties
3. **Fluid Typography**: Implementing clamp() for responsive text sizing
4. **Container Queries**: Using @container for component-level responsiveness
5. **Logical Properties**: Adopting padding-inline, margin-block for better i18n support
6. **Modern CSS Features**: Leveraging :has(), color-mix(), aspect-ratio, subgrid, and cascade layers
7. **Tailwind CSS 4.1 Integration**: Utilizing native cascade layers, container queries, and enhanced JIT compilation
8. **shadcn/ui Compatibility**: Preserving component styling and accessibility features
9. **WCAG 2.2 AAA Compliance**: Maintaining 7:1 contrast ratios and accessibility standards

## Architecture

### CSS Modernization Strategy

The refactor follows a systematic approach to minimize risk and ensure quality:

```
Phase 1: Audit and Planning
├── Identify all fixed px usage across codebase
├── Categorize by type (typography, spacing, layout, borders)
├── Document exceptions (hairline borders, root font-size)
└── Create conversion mapping (px → rem/em/%)

Phase 2: Typography Refactor
├── Convert font-size from px to rem
├── Implement clamp() for fluid typography
├── Update line-height and letter-spacing
└── Verify WCAG AAA contrast ratios

Phase 3: Spacing Refactor
├── Convert padding/margin from px to rem/em
├── Implement logical properties (padding-inline, margin-block)
├── Update Tailwind spacing utilities
└── Test responsive behavior

Phase 4: Layout Refactor
├── Replace float-based layouts with flexbox/grid
├── Implement gap property for spacing
├── Add container queries for component responsiveness
├── Use new viewport units (dvh, lvh, svh)
└── Implement subgrid for nested layouts

Phase 5: Modern CSS Features
├── Implement :has(), :is(), :where() selectors
├── Use color-mix() for dynamic colors
├── Add aspect-ratio for maintaining proportions
├── Organize styles with @layer directives
└── Test browser compatibility and fallbacks

Phase 6: Testing and Verification
├── Run automated accessibility tests
├── Verify WCAG AAA compliance
├── Test responsive behavior at all breakpoints
├── Verify visual design preservation
└── Run performance benchmarks
```

### Unit Conversion Guidelines

**Typography (Font Sizes)**:
- Base: 16px → 1rem
- Small: 14px → 0.875rem
- Large: 18px → 1.125rem
- Heading 1: 32px → 2rem
- Heading 2: 24px → 1.5rem
- Heading 3: 20px → 1.25rem

**Spacing (Padding/Margin)**:
- Extra Small: 4px → 0.25rem
- Small: 8px → 0.5rem
- Medium: 16px → 1rem
- Large: 24px → 1.5rem
- Extra Large: 32px → 2rem

**Layout (Widths/Heights)**:
- Container: 1200px → 75rem or clamp(20rem, 90vw, 75rem)
- Sidebar: 320px → 20rem
- Header: 64px → 4rem or clamp(3rem, 5vw, 4rem)
- Full Height: 100vh → 100dvh

**Allowed px Usage**:
- Root font-size: 16px (standard)
- Hairline borders: 1px (standard)
- Pixel-perfect alignments: documented with comments


## Components and Interfaces

### CSS Modernization Utilities

```typescript
/**
 * Utility for converting px values to rem
 * @param px - Pixel value to convert
 * @param base - Base font size in pixels (default: 16)
 * @returns rem value as string
 */
export function pxToRem(px: number, base: number = 16): string {
  return `${px / base}rem`;
}

/**
 * Utility for creating fluid typography with clamp()
 * @param min - Minimum size in rem
 * @param preferred - Preferred size using viewport units
 * @param max - Maximum size in rem
 * @returns clamp() CSS value
 */
export function fluidType(min: string, preferred: string, max: string): string {
  return `clamp(${min}, ${preferred}, ${max})`;
}

/**
 * Utility for checking browser support for modern CSS features
 */
export const cssSupport = {
  backdropFilter: CSS.supports('backdrop-filter', 'blur(10px)') || 
                   CSS.supports('-webkit-backdrop-filter', 'blur(10px)'),
  containerQueries: CSS.supports('container-type', 'inline-size'),
  hasSelector: CSS.supports('selector(:has(*))'),
  colorMix: CSS.supports('background', 'color-mix(in srgb, red, blue)'),
  subgrid: CSS.supports('grid-template-columns', 'subgrid'),
  aspectRatio: CSS.supports('aspect-ratio', '16 / 9'),
  dvh: CSS.supports('height', '100dvh'),
};

/**
 * Configuration for responsive breakpoints in rem
 */
export const breakpoints = {
  sm: '30rem',    // 480px
  md: '48rem',    // 768px
  lg: '64rem',    // 1024px
  xl: '80rem',    // 1280px
  '2xl': '96rem', // 1536px
} as const;
```

### Tailwind CSS 4.1 Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Use rem-based spacing scale
      spacing: {
        '0': '0',
        'px': '1px',
        '0.5': '0.125rem',  // 2px
        '1': '0.25rem',     // 4px
        '2': '0.5rem',      // 8px
        '3': '0.75rem',     // 12px
        '4': '1rem',        // 16px
        '5': '1.25rem',     // 20px
        '6': '1.5rem',      // 24px
        '8': '2rem',        // 32px
        '10': '2.5rem',     // 40px
        '12': '3rem',       // 48px
        '16': '4rem',       // 64px
        '20': '5rem',       // 80px
        '24': '6rem',       // 96px
      },
      
      // Fluid typography using clamp()
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        
        // Fluid typography
        'fluid-sm': 'clamp(0.875rem, 2vw + 0.5rem, 1rem)',
        'fluid-base': 'clamp(1rem, 2vw + 0.5rem, 1.125rem)',
        'fluid-lg': 'clamp(1.125rem, 2vw + 0.75rem, 1.5rem)',
        'fluid-xl': 'clamp(1.5rem, 3vw + 1rem, 2.25rem)',
        'fluid-2xl': 'clamp(2rem, 4vw + 1rem, 3rem)',
      },
      
      // New viewport units
      height: {
        'screen-dynamic': '100dvh',
        'screen-large': '100lvh',
        'screen-small': '100svh',
      },
      
      minHeight: {
        'screen-dynamic': '100dvh',
        'screen-large': '100lvh',
        'screen-small': '100svh',
      },
      
      // Container query support
      containers: {
        'xs': '20rem',
        'sm': '24rem',
        'md': '28rem',
        'lg': '32rem',
        'xl': '36rem',
        '2xl': '42rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
} satisfies Config;
```

### Modern CSS Patterns

**Fluid Typography with clamp()**:
```css
/* ✅ GOOD: Fluid typography */
h1 {
  font-size: clamp(1.75rem, 2vw + 1rem, 2.5rem);
  line-height: 1.2;
}

/* ❌ BAD: Fixed breakpoints */
h1 {
  font-size: 1.75rem;
}
@media (min-width: 768px) {
  h1 {
    font-size: 2.25rem;
  }
}
```

**Container Queries**:
```css
/* ✅ GOOD: Container queries */
.card-container {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 30rem) {
  .card-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
}

/* ❌ BAD: Media queries for component styling */
@media (min-width: 768px) {
  .card-content {
    display: grid;
  }
}
```

**Logical Properties**:
```css
/* ✅ GOOD: Logical properties */
.component {
  padding-inline: 1rem;
  margin-block: 2rem;
  border-inline-start: 1px solid;
}

/* ❌ BAD: Physical properties */
.component {
  padding-left: 1rem;
  padding-right: 1rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
  border-left: 1px solid;
}
```

**Modern Selectors**:
```css
/* ✅ GOOD: :has() for parent styling */
.card:has(img) {
  padding: 0;
}

.form:has(:invalid) {
  border-color: red;
}

/* ✅ GOOD: :is() for grouping */
:is(h1, h2, h3) {
  font-weight: bold;
  margin-block: 1rem;
}

/* ✅ GOOD: :where() for low specificity */
:where(ul, ol) {
  padding-inline-start: 2rem;
}
```

**Modern Layout with gap**:
```css
/* ✅ GOOD: flex gap */
.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* ❌ BAD: Margin on children */
.actions {
  display: flex;
}
.actions > * {
  margin-right: 0.5rem;
}
.actions > *:last-child {
  margin-right: 0;
}
```

**New Viewport Units**:
```css
/* ✅ GOOD: Dynamic viewport units */
.full-height {
  height: 100dvh; /* Accounts for mobile browser UI */
  min-height: 100lvh; /* Large viewport height */
}

/* ❌ BAD: Fixed viewport units */
.full-height {
  height: 100vh; /* Doesn't account for mobile browser UI */
}
```

**aspect-ratio Property**:
```css
/* ✅ GOOD: aspect-ratio */
.image-container {
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

/* ❌ BAD: Padding hack */
.image-container {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 */
}
```

**Cascade Layers**:
```css
/* ✅ GOOD: Cascade layers */
@layer reset, base, components, utilities;

@layer base {
  html {
    font-size: 16px;
  }
  
  body {
    font-family: system-ui, sans-serif;
    line-height: 1.5;
  }
}

@layer components {
  .button {
    padding-inline: 1rem;
    padding-block: 0.5rem;
    border-radius: 0.5rem;
  }
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```


## Data Models

### CSS Modernization Audit

```typescript
interface CSSAuditResult {
  file: string;
  line: number;
  column: number;
  type: 'typography' | 'spacing' | 'layout' | 'border' | 'other';
  currentValue: string;
  suggestedValue: string;
  priority: 'high' | 'medium' | 'low';
  exception: boolean;
  exceptionReason?: string;
}

interface ConversionMapping {
  px: number;
  rem: string;
  em: string;
  percentage?: string;
  notes?: string;
}

interface BrowserSupport {
  feature: string;
  supported: boolean;
  fallbackRequired: boolean;
  fallbackStrategy?: string;
}
```

### Refactor Progress Tracking

```typescript
interface RefactorProgress {
  phase: 'audit' | 'typography' | 'spacing' | 'layout' | 'modern-css' | 'testing';
  filesTotal: number;
  filesCompleted: number;
  pxValuesTotal: number;
  pxValuesConverted: number;
  exceptionsDocumented: number;
  testsUpdated: number;
  accessibilityIssues: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Typography Uses Relative Units
*For any* text element with font-size defined, the font-size SHALL use rem units or clamp() function instead of fixed px values (excluding root font-size).
**Validates: Requirements 1.1, 3.1**

### Property 2: Spacing Uses Relative Units
*For any* element with padding or margin defined, the spacing SHALL use rem or em units instead of fixed px values.
**Validates: Requirements 1.2**

### Property 3: Layout Uses Flexible Units
*For any* layout container with width or height defined, the dimensions SHALL use %, fr, minmax(), viewport units, or clamp() instead of fixed px values.
**Validates: Requirements 1.3**

### Property 4: Tailwind Spacing Scale Consistency
*For any* element using Tailwind spacing utilities, the utilities SHALL use Tailwind's rem-based scale (p-4, gap-6) instead of arbitrary px values.
**Validates: Requirements 1.4**

### Property 5: Documented Pixel Exceptions
*For any* fixed px value used (excluding root font-size and 1px borders), the code SHALL include a comment explaining why the exception is necessary.
**Validates: Requirements 1.5, 18.1**

### Property 6: Flexbox for One-Dimensional Layouts
*For any* one-dimensional layout (row or column), the container SHALL use display: flex instead of float-based or table-based layouts.
**Validates: Requirements 2.1**

### Property 7: Grid for Two-Dimensional Layouts
*For any* two-dimensional layout (rows and columns), the container SHALL use display: grid instead of float-based or table-based layouts.
**Validates: Requirements 2.2**

### Property 8: Gap Property for Spacing
*For any* flex or grid container with spacing between items, the container SHALL use gap property instead of margins on children.
**Validates: Requirements 2.3, 11.1**

### Property 9: Modern Alignment Properties
*For any* flex or grid container requiring alignment, the container SHALL use justify-content, align-items, place-items, or place-content instead of manual positioning.
**Validates: Requirements 2.4**

### Property 10: Minimal Absolute Positioning
*For any* layout, absolute positioning SHALL only be used when alignment properties cannot achieve the desired result, and the reason SHALL be documented.
**Validates: Requirements 2.5**

### Property 11: Fluid Typography with clamp()
*For any* heading or responsive text element, the font-size SHALL use clamp() with minimum, preferred, and maximum values for fluid scaling.
**Validates: Requirements 3.1**

### Property 12: Semantic Tailwind Text Utilities
*For any* text element using Tailwind, the element SHALL use semantic text utilities (text-sm, text-base, text-lg) instead of arbitrary font-size values.
**Validates: Requirements 3.3**

### Property 13: Readable Line Height
*For any* body text element, the line-height SHALL be between 1.4 and 1.6 to ensure readability.
**Validates: Requirements 3.4**

### Property 14: Container Queries for Component Responsiveness
*For any* reusable component with responsive behavior, the component SHALL use @container queries instead of @media queries where appropriate.
**Validates: Requirements 4.1**

### Property 15: Container Query Breakpoints in rem
*For any* container query breakpoint, the breakpoint SHALL use rem units (e.g., @container (min-width: 30rem)) instead of px.
**Validates: Requirements 4.2**

### Property 16: Logical Properties for Horizontal Spacing
*For any* element with horizontal padding, the element SHALL use padding-inline instead of padding-left/padding-right.
**Validates: Requirements 5.1**

### Property 17: Logical Properties for Vertical Spacing
*For any* element with vertical margins, the element SHALL use margin-block instead of margin-top/margin-bottom.
**Validates: Requirements 5.2**

### Property 18: Logical Properties for Borders
*For any* element with directional borders, the element SHALL use border-inline-start/end instead of border-left/right.
**Validates: Requirements 5.3**

### Property 19: :has() Selector for Parent Styling
*For any* parent element that needs styling based on child presence, the element SHALL use :has() selector (e.g., .card:has(img)) with appropriate fallback.
**Validates: Requirements 6.1**

### Property 20: :is() Selector for Grouping
*For any* group of selectors with identical styles, the styles SHALL use :is() for cleaner syntax (e.g., :is(h1, h2, h3)).
**Validates: Requirements 6.2**

### Property 21: color-mix() for Dynamic Colors
*For any* color that requires mixing or opacity adjustment, the styles SHALL use color-mix() function with appropriate fallback.
**Validates: Requirements 7.1**

### Property 22: Dynamic Viewport Units for Full Height
*For any* full-height layout element, the height SHALL use dvh (dynamic viewport height) instead of vh, with vh as fallback.
**Validates: Requirements 8.1**

### Property 23: Subgrid for Nested Grid Alignment
*For any* nested grid that needs to align with parent grid, the child SHALL use grid-template-columns: subgrid with appropriate fallback.
**Validates: Requirements 9.1**

### Property 24: aspect-ratio for Maintaining Proportions
*For any* element requiring aspect ratio maintenance, the element SHALL use aspect-ratio property instead of padding-bottom hack, with fallback.
**Validates: Requirements 10.1**

### Property 25: Cascade Layers for Style Organization
*For any* custom component styles, the styles SHALL be placed in @layer components, and utility styles SHALL be placed in @layer utilities.
**Validates: Requirements 12.1**

### Property 26: Tailwind Utility Preference
*For any* styling need, Tailwind utility classes SHALL be preferred over custom CSS unless the utility doesn't exist or is insufficient.
**Validates: Requirements 13.1**

### Property 27: rem-based Tailwind Extensions
*For any* custom Tailwind value, the value SHALL use rem units instead of px in the Tailwind config.
**Validates: Requirements 13.2**

### Property 28: shadcn/ui Component Preservation
*For any* shadcn/ui component, the component's base styles SHALL NOT be overridden with broad global selectors.
**Validates: Requirements 14.1**

### Property 29: WCAG AAA Contrast Compliance
*For any* text element, the contrast ratio between text color and background color SHALL meet or exceed 7:1 for normal text and 4.5:1 for large text.
**Validates: Requirements 15.1**

### Property 30: Focus Indicator Contrast
*For any* interactive element, the focus indicator SHALL have minimum 3:1 contrast ratio against the background.
**Validates: Requirements 15.3**

### Property 31: Touch Target Size
*For any* interactive element on touch devices, the element SHALL have minimum 44x44 CSS pixels for touch targets.
**Validates: Requirements 15.4**

### Property 32: Visual Design Preservation
*For any* refactored element, the visual appearance SHALL remain consistent with the original design (minor differences acceptable for improved responsiveness).
**Validates: Requirements 16.1**

### Property 33: Responsive Breakpoints in rem
*For any* media query breakpoint, the breakpoint SHALL use rem units (e.g., @media (min-width: 48rem)) instead of px.
**Validates: Requirements 17.2**

### Property 34: Browser Compatibility Fallbacks
*For any* modern CSS feature used, appropriate fallbacks SHALL be provided for browsers that don't support the feature.
**Validates: Requirements 19.1**

### Property 35: Performance Maintenance
*For any* refactored styles, the rendering performance SHALL not degrade compared to the original implementation.
**Validates: Requirements 20.1**


## Error Handling

### CSS Modernization Error Recovery

1. **Conversion Errors**: If automated conversion produces invalid CSS, log the error and skip the conversion with a warning
2. **Browser Support Errors**: If a modern CSS feature is not supported, apply documented fallback styles
3. **Layout Breaking Errors**: If refactored styles break layout, revert to original styles and document the issue
4. **Accessibility Errors**: If refactored styles fail WCAG AAA compliance, adjust colors/contrast immediately

### Fallback Strategies

**Container Queries**:
```css
/* Fallback for browsers without container query support */
.card-content {
  display: block; /* Fallback */
}

@supports (container-type: inline-size) {
  .card-container {
    container-type: inline-size;
  }
  
  @container (min-width: 30rem) {
    .card-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
}
```

**:has() Selector**:
```css
/* Fallback for browsers without :has() support */
.card {
  padding: 1rem; /* Default padding */
}

@supports selector(:has(*)) {
  .card:has(img) {
    padding: 0; /* Remove padding when image present */
  }
}
```

**color-mix()**:
```css
/* Fallback for browsers without color-mix() support */
.element {
  background: rgba(59, 130, 246, 0.8); /* Fallback */
  background: color-mix(in srgb, rgb(59 130 246) 80%, transparent);
}
```

**dvh Viewport Units**:
```css
/* Fallback for browsers without dvh support */
.full-height {
  height: 100vh; /* Fallback */
  height: 100dvh; /* Modern browsers */
}
```

**aspect-ratio**:
```css
/* Fallback for browsers without aspect-ratio support */
.image-container {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 fallback */
}

@supports (aspect-ratio: 16 / 9) {
  .image-container {
    padding-bottom: 0;
    aspect-ratio: 16 / 9;
  }
}
```

## Testing Strategy

### Unit Testing Approach

Unit tests will verify CSS modernization at the component level:

1. **Relative Unit Usage**: Test that components use rem/em instead of px
2. **Layout Systems**: Test that components use flexbox/grid with gap
3. **Responsive Behavior**: Test that components respond to container size changes
4. **Accessibility**: Test that contrast ratios meet WCAG AAA standards
5. **Browser Support**: Test that fallbacks work in browsers without modern CSS support

### Property-Based Testing

Property-based tests will use fast-check library with minimum 100 iterations per property:

**PBT Library**: fast-check (https://github.com/dubzzz/fast-check)

**Configuration**: Each property test SHALL run with at least 100 iterations.

**Tagging Convention**: Each property-based test MUST include a comment tag:
```typescript
// Feature: css-modernization-responsive-units, Property N: [property description]
```

**Property Test Examples**:

```typescript
// Feature: css-modernization-responsive-units, Property 1: Typography Uses Relative Units
test('All text elements use relative units for font-size', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('h1', 'h2', 'h3', 'p', 'span', 'button'),
      (element) => {
        const { container } = render(<TestComponent element={element} />);
        const el = container.querySelector(element);
        const computedStyle = window.getComputedStyle(el!);
        const fontSize = computedStyle.fontSize;
        
        // Font size should be in px (computed), but original should be rem
        // Check that it's not a fixed px value by testing responsiveness
        const rootFontSize = parseFloat(
          window.getComputedStyle(document.documentElement).fontSize
        );
        
        // If we change root font size, element should scale
        document.documentElement.style.fontSize = '20px';
        const newFontSize = window.getComputedStyle(el!).fontSize;
        document.documentElement.style.fontSize = '16px';
        
        return parseFloat(newFontSize) !== parseFloat(fontSize);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: css-modernization-responsive-units, Property 8: Gap Property for Spacing
test('Flex and grid containers use gap property for spacing', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('flex', 'grid'),
      fc.integer({ min: 1, max: 10 }),
      (display, itemCount) => {
        const { container } = render(
          <TestContainer display={display} itemCount={itemCount} />
        );
        
        const containerEl = container.firstChild as HTMLElement;
        const computedStyle = window.getComputedStyle(containerEl);
        
        // Should have gap property set
        const gap = computedStyle.gap;
        return gap !== 'normal' && gap !== '0px';
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: css-modernization-responsive-units, Property 29: WCAG AAA Contrast Compliance
test('All text elements meet WCAG AAA contrast requirements', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('light', 'dark'),
      fc.string({ minLength: 1, maxLength: 100 }),
      (theme, textContent) => {
        const { container } = render(
          <ThemeProvider theme={theme}>
            <div className="text-gray-900 dark:text-gray-100">
              {textContent}
            </div>
          </ThemeProvider>
        );
        
        const element = container.querySelector('div');
        const computedStyle = window.getComputedStyle(element!);
        const textColor = computedStyle.color;
        const bgColor = computedStyle.backgroundColor;
        
        const contrastRatio = calculateContrastRatio(textColor, bgColor);
        return contrastRatio >= 7.0; // WCAG AAA for normal text
      }
    ),
    { numRuns: 100 }
  );
});
```

### E2E Testing Approach

E2E tests will verify CSS modernization across the entire application:

1. **Visual Regression**: Compare screenshots before and after refactor
2. **Responsive Behavior**: Test layout at mobile, tablet, and desktop breakpoints
3. **Accessibility**: Run axe-core to verify WCAG AAA compliance
4. **Browser Compatibility**: Test on Chrome, Firefox, Safari, and Edge
5. **Performance**: Measure rendering performance and compare to baseline

### Test Coverage Requirements

- **Overall Coverage**: Minimum 80% line coverage for all refactored files
- **Critical Paths**: 100% coverage for layout components and accessibility utilities
- **Property Tests**: All 35 correctness properties must have corresponding property-based tests
- **E2E Tests**: All critical user flows must pass on all supported browsers

### Quality Gates

All tests must pass with:
- **Zero errors**: No test failures, no TypeScript errors, no ESLint errors
- **Zero warnings**: No test warnings, no TypeScript warnings, no ESLint warnings
- **No rule bypasses**: No eslint-disable comments, no @ts-ignore, no type assertions
- **Meaningful tests**: Tests must verify actual behavior, not implementation details

## Performance Considerations

### CSS Performance Optimization

1. **Minimize Calculations**: Use clamp() and calc() judiciously to avoid performance overhead
2. **Container Query Performance**: Monitor performance impact of container queries on large component trees
3. **Selector Performance**: Avoid overly complex selectors and excessive nesting
4. **Animation Performance**: Ensure animations using modern units remain smooth at 60fps
5. **Bundle Size**: Optimize CSS bundle size with Tailwind purging and tree-shaking

### Performance Monitoring

```typescript
interface PerformanceMetrics {
  renderTime: number;
  layoutTime: number;
  paintTime: number;
  cssParseTime: number;
  bundleSize: number;
}

function measurePerformance(): PerformanceMetrics {
  const perfEntries = performance.getEntriesByType('measure');
  // Measure and return performance metrics
}
```

## Browser Compatibility

### Supported Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

### Feature Support Matrix

| Feature | Chrome | Firefox | Safari | Fallback Required |
|---------|--------|---------|--------|-------------------|
| Container Queries | 105+ | 110+ | 16+ | Yes |
| :has() Selector | 105+ | 121+ | 15.4+ | Yes |
| color-mix() | 111+ | 113+ | 16.2+ | Yes |
| dvh/lvh/svh | 108+ | 101+ | 15.4+ | Yes |
| Subgrid | 117+ | 71+ | 16+ | Yes |
| aspect-ratio | 88+ | 89+ | 15+ | Yes |
| @layer | 99+ | 97+ | 15.4+ | No |

### Feature Detection

```typescript
export function detectCSSFeatures(): Record<string, boolean> {
  return {
    containerQueries: CSS.supports('container-type', 'inline-size'),
    hasSelector: CSS.supports('selector(:has(*))'),
    colorMix: CSS.supports('background', 'color-mix(in srgb, red, blue)'),
    dvh: CSS.supports('height', '100dvh'),
    subgrid: CSS.supports('grid-template-columns', 'subgrid'),
    aspectRatio: CSS.supports('aspect-ratio', '16 / 9'),
    cascadeLayers: CSS.supports('@layer', 'test'),
  };
}
```

## Deployment Considerations

### Build Configuration

1. **Tailwind Purging**: Configure Tailwind to purge unused classes in production
2. **CSS Minification**: Minify CSS with cssnano or similar tool
3. **Source Maps**: Generate source maps for debugging but exclude from production bundle
4. **Critical CSS**: Inline critical CSS for above-the-fold content
5. **CSS Splitting**: Split CSS by route for better code splitting

### Migration Strategy

1. **Gradual Rollout**: Refactor one component/page at a time
2. **Feature Flags**: Use feature flags to enable/disable refactored styles
3. **A/B Testing**: Compare refactored vs original styles with real users
4. **Rollback Plan**: Maintain ability to quickly rollback if issues arise
5. **Monitoring**: Monitor performance metrics and user feedback during rollout

## Success Criteria

The CSS modernization is considered successful when:

1. ✅ All fixed px values are converted to relative units (except documented exceptions)
2. ✅ All layouts use modern flexbox/grid with gap property
3. ✅ All typography uses rem units or clamp() for fluid scaling
4. ✅ All components use container queries for responsiveness where appropriate
5. ✅ All spacing uses logical properties (padding-inline, margin-block)
6. ✅ All modern CSS features have appropriate fallbacks
7. ✅ All text meets WCAG AAA contrast requirements (7:1 for normal, 4.5:1 for large)
8. ✅ All interactive elements have minimum 44x44px touch targets
9. ✅ All unit tests pass with >80% coverage
10. ✅ All E2E tests pass on Chrome, Firefox, Safari, and Edge
11. ✅ TypeScript type-check reports zero errors
12. ✅ ESLint reports zero errors and zero warnings
13. ✅ All 35 correctness properties have passing property-based tests
14. ✅ Visual design is preserved (minor differences acceptable)
15. ✅ Performance metrics meet or exceed baseline
16. ✅ Code is clean with documented exceptions
17. ✅ Commit history follows conventional commit format
