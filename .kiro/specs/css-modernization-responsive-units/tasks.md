# Implementation Plan

## Overview

This implementation plan breaks down the CSS modernization and responsive units refactor into discrete, manageable tasks. Each task builds incrementally on previous work, with checkpoints to ensure all tests pass before proceeding.

## Technology Stack

**Core Technologies:**
- **React 19.2**: Latest React with concurrent features, use() hook, and automatic batching
- **Tailwind CSS 4.1**: Native cascade layers, container queries, enhanced JIT compilation
- **shadcn/ui**: Accessible component library with Radix UI primitives
- **TypeScript 5.3+**: Strict mode with comprehensive type safety
- **Vitest**: Fast unit testing with happy-dom
- **Playwright**: E2E testing with cross-browser support
- **fast-check**: Property-based testing library

**Development Tools (MCP):**
- **Serena MCP**: Code analysis, symbol search, refactoring, file management
- **Sequential Thinking MCP**: Problem-solving, architectural planning, decision-making
- **shadcn MCP**: Component discovery and installation (if needed)
- **Chrome DevTools MCP**: Real-time debugging, contrast checking, performance profiling
- **Playwright MCP**: Automated browser testing and interaction verification

## Key Principles

1. **Gradual Refactor**: One component/file at a time to minimize risk
2. **Preserve Functionality**: No changes to behavior, only styling
3. **Maintain Accessibility**: WCAG 2.2 AAA compliance throughout
4. **Use MCP Tools**: Leverage tools for analysis, planning, and verification
5. **Test Continuously**: Run tests after each significant change
6. **Document Exceptions**: Comment all necessary px usage
7. **Verify Visually**: Use Chrome DevTools to verify changes

## Development Tools and Best Practices

### MCP Tools Usage

**Always use these tools to enhance development quality:**

1. **Serena MCP** (Code Analysis)
   - `mcp_serena_get_symbols_overview`: Understand file structure
   - `mcp_serena_find_symbol`: Locate components and functions
   - `mcp_serena_search_for_pattern`: Find all px usage, fixed values
   - `mcp_serena_find_referencing_symbols`: Identify dependencies
   - `mcp_serena_replace_symbol_body`: Refactor implementations

2. **Sequential Thinking MCP** (`mcp_sequential_thinking_sequentialthinking`)
   - Use BEFORE implementing complex changes
   - Break down problems into steps
   - Consider multiple approaches
   - Identify edge cases and potential issues
   - Plan the optimal solution

3. **Chrome DevTools MCP** (Browser Debugging)
   - `mcp_chrome_devtools_navigate`: Load the application
   - `mcp_chrome_devtools_take_snapshot`: Verify accessibility structure
   - `mcp_chrome_devtools_evaluate_script`: Measure styles, contrast, dimensions
   - `mcp_chrome_devtools_take_screenshot`: Capture visual state
   - `mcp_chrome_devtools_list_console_messages`: Check for errors

4. **Playwright MCP** (Automated Testing)
   - `mcp_microsoft_playwright_mcp_browser_navigate`: Test navigation
   - `mcp_microsoft_playwright_mcp_browser_snapshot`: Verify layout
   - `mcp_microsoft_playwright_mcp_browser_click`: Test interactions
   - `mcp_microsoft_playwright_mcp_browser_evaluate`: Check DOM state

### Recommended Workflow for Each Task

```
1. ANALYZE (Serena MCP)
   → Understand current code structure
   → Find all related components and usages
   → Identify all px values to convert

2. THINK (Sequential Thinking MCP)
   → Break down the problem
   → Consider conversion strategy
   → Plan the optimal solution
   → Identify potential issues

3. IMPLEMENT
   → Convert px to rem/em/%
   → Update Tailwind utilities
   → Add modern CSS features
   → Document exceptions

4. VERIFY (Chrome DevTools MCP)
   → Inspect the result in browser
   → Measure dimensions and spacing
   → Check contrast ratios
   → Verify responsive behavior

5. TEST (Playwright MCP)
   → Run automated tests
   → Verify behavior across browsers
   → Check accessibility compliance

6. ITERATE
   → Refine based on findings
   → Use Sequential Thinking for complex issues
```

## Task List

- [ ] 0. Phase 0: Audit and Planning (P0)
  - Audit codebase for px usage and create conversion plan
  - _Requirements: 1.1-1.5, 18.1-18.5_

- [ ] 0.1 Set up CSS modernization utilities
  - Create utility functions for px to rem conversion
  - Create fluidType utility for clamp() generation
  - Create cssSupport object for feature detection
  - Create breakpoints configuration in rem
  - Add TypeScript types for all utilities
  - Write unit tests for utilities
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 0.2 Audit codebase for fixed px usage
  - Use Serena MCP to search for all px values in CSS files
  - Use Serena MCP to search for px values in Tailwind classes
  - Use Serena MCP to search for px values in inline styles
  - Categorize by type: typography, spacing, layout, borders, other
  - Document current values and suggested conversions
  - Identify exceptions (root font-size, hairline borders)
  - Create conversion mapping spreadsheet/document
  - _Requirements: 1.1-1.5, 18.1_
  - _Tools: serena_

- [ ] 0.3 Configure Tailwind CSS 4.1 for modern CSS
  - Update tailwind.config.ts with rem-based spacing scale
  - Add fluid typography utilities (fluid-sm, fluid-base, etc.)
  - Add new viewport unit utilities (screen-dynamic, screen-large, screen-small)
  - Configure container query support
  - Add custom utilities for logical properties if needed
  - Test Tailwind configuration builds correctly
  - _Requirements: 1.4, 3.3, 8.1-8.5, 13.1-13.5_

- [ ] 0.4 Create baseline visual regression snapshots
  - Use Chrome DevTools MCP to navigate to all major pages
  - Use Chrome DevTools MCP to take screenshots at mobile, tablet, desktop
  - Save screenshots as baseline for comparison
  - Document current layout dimensions and spacing
  - _Requirements: 16.1-16.5_
  - _Tools: chrome-devtools_

- [ ] 0.5 Set up browser support detection
  - Implement cssSupport utility with feature detection
  - Test detection for: container queries, :has(), color-mix(), dvh, subgrid, aspect-ratio
  - Add fallback detection logic
  - Write unit tests for feature detection
  - _Requirements: 19.1-19.5_

- [ ] 1. Checkpoint: Verify Phase 0 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 2. Phase 1: Typography Refactor (P0)
  - Convert all font-size from px to rem or clamp()
  - _Requirements: 1.1, 3.1-3.5_

- [ ] 2.1 Audit typography usage
  - Use Serena MCP to find all font-size declarations
  - Use Serena MCP to find all Tailwind text utilities
  - Document current font sizes and their usage
  - Create conversion plan (px → rem or clamp())
  - _Requirements: 1.1, 3.1_
  - _Tools: serena_

- [ ] 2.2 Convert base typography to rem
  - Use Sequential Thinking MCP to plan conversion strategy
  - Convert body text from px to rem (16px → 1rem)
  - Convert headings from px to rem (h1: 32px → 2rem, h2: 24px → 1.5rem, etc.)
  - Convert small text from px to rem (14px → 0.875rem)
  - Update CSS files with rem values
  - Use Chrome DevTools MCP to verify font sizes render correctly
  - _Requirements: 1.1, 3.1_
  - _Tools: sequential-thinking, chrome-devtools_

- [ ] 2.3 Implement fluid typography with clamp()
  - Identify headings and responsive text that should scale
  - Implement clamp() for h1: clamp(1.75rem, 2vw + 1rem, 2.5rem)
  - Implement clamp() for h2: clamp(1.5rem, 2vw + 0.75rem, 2rem)
  - Implement clamp() for h3: clamp(1.25rem, 2vw + 0.5rem, 1.75rem)
  - Test fluid scaling at different viewport sizes
  - Use Chrome DevTools MCP to verify smooth scaling
  - _Requirements: 3.1, 3.2_
  - _Tools: chrome-devtools_

- [ ] 2.4 Update Tailwind text utilities
  - Review Tailwind config fontSize settings
  - Ensure all text utilities use rem (text-sm: 0.875rem, text-base: 1rem, etc.)
  - Add fluid typography utilities to Tailwind config
  - Replace arbitrary text-[14px] with semantic text-sm
  - Test all text utilities render correctly
  - _Requirements: 1.4, 3.3, 13.1_

- [ ] 2.5 Verify line-height and readability
  - Check all body text has line-height between 1.4-1.6
  - Check headings have appropriate line-height (1.2-1.3)
  - Adjust letter-spacing if too tight
  - Use Chrome DevTools MCP to measure computed line-height
  - _Requirements: 3.4, 3.5_
  - _Tools: chrome-devtools_

- [ ] 2.6 Write property-based test for typography
  - **Property 1: Typography Uses Relative Units**
  - **Property 11: Fluid Typography with clamp()**
  - **Property 12: Semantic Tailwind Text Utilities**
  - **Property 13: Readable Line Height**
  - **Validates: Requirements 1.1, 3.1, 3.3, 3.4**

- [ ] 2.7 Visual regression test for typography
  - Use Chrome DevTools MCP to take new screenshots
  - Compare with baseline screenshots
  - Verify text appears visually similar
  - Document any intentional differences
  - _Requirements: 16.1, 16.2_
  - _Tools: chrome-devtools_

- [ ] 3. Checkpoint: Verify Phase 1 completion
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 4. Phase 2: Spacing Refactor (P0)
  - Convert all padding/margin from px to rem/em
  - _Requirements: 1.2, 5.1-5.4_

- [ ] 4.1 Audit spacing usage
  - Use Serena MCP to find all padding declarations
  - Use Serena MCP to find all margin declarations
  - Use Serena MCP to find all Tailwind spacing utilities
  - Document current spacing values and their usage
  - Create conversion plan (px → rem or em)
  - _Requirements: 1.2_
  - _Tools: serena_

- [ ] 4.2 Convert component padding to rem/em
  - Use Sequential Thinking MCP to plan conversion strategy
  - Convert padding from px to rem (8px → 0.5rem, 16px → 1rem, 24px → 1.5rem)
  - Use em for padding that should scale with component font-size
  - Update CSS files with rem/em values
  - Use Chrome DevTools MCP to verify spacing renders correctly
  - _Requirements: 1.2_
  - _Tools: sequential-thinking, chrome-devtools_

- [ ] 4.3 Convert margins to rem
  - Convert margin from px to rem (8px → 0.5rem, 16px → 1rem, 24px → 1.5rem)
  - Update CSS files with rem values
  - Use Chrome DevTools MCP to verify spacing renders correctly
  - _Requirements: 1.2_
  - _Tools: chrome-devtools_

- [ ] 4.4 Implement logical properties for spacing
  - Replace padding-left/right with padding-inline
  - Replace padding-top/bottom with padding-block
  - Replace margin-left/right with margin-inline
  - Replace margin-top/bottom with margin-block
  - Test with RTL language to verify correct behavior
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 4.5 Update Tailwind spacing utilities
  - Review Tailwind config spacing settings
  - Ensure all spacing utilities use rem (p-4: 1rem, m-6: 1.5rem, etc.)
  - Replace arbitrary p-[16px] with semantic p-4
  - Replace arbitrary m-[24px] with semantic m-6
  - Test all spacing utilities render correctly
  - _Requirements: 1.4, 13.1_

- [ ] 4.6 Write property-based tests for spacing
  - **Property 2: Spacing Uses Relative Units**
  - **Property 16: Logical Properties for Horizontal Spacing**
  - **Property 17: Logical Properties for Vertical Spacing**
  - **Property 18: Logical Properties for Borders**
  - **Validates: Requirements 1.2, 5.1, 5.2, 5.3**

- [ ] 4.7 Visual regression test for spacing
  - Use Chrome DevTools MCP to take new screenshots
  - Compare with baseline screenshots
  - Verify spacing appears visually similar
  - Document any intentional differences
  - _Requirements: 16.1_
  - _Tools: chrome-devtools_

- [ ] 5. Checkpoint: Verify Phase 2 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Phase 3: Layout Refactor (P0)
  - Convert layouts to flexbox/grid with gap
  - _Requirements: 2.1-2.5, 11.1-11.5_

- [ ] 6.1 Audit layout systems
  - Use Serena MCP to find all float-based layouts
  - Use Serena MCP to find all table-based layouts
  - Use Serena MCP to find all absolute positioning
  - Document current layout patterns
  - Create modernization plan (float → flex/grid)
  - _Requirements: 2.1, 2.2_
  - _Tools: serena_

- [ ] 6.2 Convert one-dimensional layouts to flexbox
  - Use Sequential Thinking MCP to plan conversion strategy
  - Replace float-based rows/columns with display: flex
  - Add flex-direction: row or column as appropriate
  - Use justify-content and align-items for alignment
  - Remove clearfix hacks and float properties
  - Use Chrome DevTools MCP to verify layout renders correctly
  - _Requirements: 2.1, 2.4_
  - _Tools: sequential-thinking, chrome-devtools_

- [ ] 6.3 Convert two-dimensional layouts to grid
  - Replace float-based grids with display: grid
  - Use grid-template-columns and grid-template-rows
  - Use grid-template-areas for named grid areas
  - Use Chrome DevTools MCP to verify grid layout
  - _Requirements: 2.2_
  - _Tools: chrome-devtools_

- [ ] 6.4 Implement gap property for spacing
  - Replace margin hacks with gap property
  - Add gap to flex containers (gap: 0.5rem, gap: 1rem, etc.)
  - Add gap to grid containers (gap: 1rem, column-gap: 1.5rem, etc.)
  - Remove margins from flex/grid children
  - Test spacing appears consistent
  - _Requirements: 2.3, 11.1_

- [ ] 6.5 Minimize absolute positioning
  - Review all position: absolute usage
  - Replace with flex/grid alignment where possible
  - Document remaining absolute positioning with comments
  - Ensure z-index values are still correct
  - _Requirements: 2.5_

- [ ] 6.6 Update Tailwind layout utilities
  - Use flex, grid, gap-* utilities instead of custom CSS
  - Replace custom flexbox CSS with Tailwind utilities
  - Replace custom grid CSS with Tailwind utilities
  - Test all layout utilities render correctly
  - _Requirements: 13.1_

- [ ] 6.7 Write property-based tests for layout
  - **Property 6: Flexbox for One-Dimensional Layouts**
  - **Property 7: Grid for Two-Dimensional Layouts**
  - **Property 8: Gap Property for Spacing**
  - **Property 9: Modern Alignment Properties**
  - **Property 10: Minimal Absolute Positioning**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 6.8 Visual regression test for layout
  - Use Chrome DevTools MCP to take new screenshots
  - Compare with baseline screenshots
  - Verify layout appears visually similar
  - Document any intentional differences
  - _Requirements: 16.1_
  - _Tools: chrome-devtools_

- [ ] 7. Checkpoint: Verify Phase 3 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Phase 4: Container Queries Implementation (P1)
  - Implement container queries for component responsiveness
  - _Requirements: 4.1-4.5_

- [ ] 8.1 Identify components for container queries
  - Use Serena MCP to find components with media queries
  - Use Sequential Thinking MCP to determine which should use container queries
  - Identify reusable components that appear in different contexts
  - Document components that will benefit from container queries
  - _Requirements: 4.1, 4.3_
  - _Tools: serena, sequential-thinking_

- [ ] 8.2 Implement container queries for card components
  - Add container-type: inline-size to card containers
  - Add container-name for specific targeting
  - Replace media queries with @container queries
  - Use rem units in container query breakpoints
  - Test cards in different container sizes
  - Use Chrome DevTools MCP to verify responsive behavior
  - _Requirements: 4.1, 4.2_
  - _Tools: chrome-devtools_

- [ ] 8.3 Implement container queries for list components
  - Add container-type: inline-size to list containers
  - Replace media queries with @container queries
  - Test lists in different container sizes
  - Verify virtualization still works correctly
  - _Requirements: 4.1, 4.2_

- [ ] 8.4 Add container query fallbacks
  - Detect container query support with cssSupport utility
  - Provide media query fallbacks for unsupported browsers
  - Use @supports to conditionally apply container queries
  - Test fallbacks in browsers without support
  - _Requirements: 4.5, 19.1_

- [ ] 8.5 Update Tailwind for container queries
  - Ensure @tailwindcss/container-queries plugin is installed
  - Configure container sizes in Tailwind config
  - Use Tailwind container query utilities where possible
  - Test Tailwind container utilities work correctly
  - _Requirements: 4.4, 13.1_

- [ ] 8.6 Write property-based tests for container queries
  - **Property 14: Container Queries for Component Responsiveness**
  - **Property 15: Container Query Breakpoints in rem**
  - **Validates: Requirements 4.1, 4.2**

- [ ] 9. Checkpoint: Verify Phase 4 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Phase 5: Modern CSS Features (P1)
  - Implement modern selectors, color functions, viewport units, etc.
  - _Requirements: 6.1-6.5, 7.1-7.5, 8.1-8.5, 9.1-9.5, 10.1-10.5, 12.1-12.5_

- [ ] 10.1 Implement :has() selector for parent styling
  - Use Serena MCP to find parent elements that need child-based styling
  - Replace JavaScript-based parent styling with :has() selector
  - Add @supports fallback for browsers without :has()
  - Test :has() selector works correctly
  - Use Chrome DevTools MCP to verify styling
  - _Requirements: 6.1_
  - _Tools: serena, chrome-devtools_

- [ ] 10.2 Implement :is() and :where() selectors
  - Replace grouped selectors with :is() for cleaner syntax
  - Use :where() for low-specificity utility classes
  - Test selectors work correctly
  - _Requirements: 6.2, 6.3_

- [ ] 10.3 Implement color-mix() for dynamic colors
  - Replace rgba() with color-mix() for opacity
  - Use color-mix() for hover state colors
  - Add fallback rgba() values for unsupported browsers
  - Test colors render correctly
  - Use Chrome DevTools MCP to verify colors
  - _Requirements: 7.1, 7.4_
  - _Tools: chrome-devtools_

- [ ] 10.4 Implement new viewport units (dvh, lvh, svh)
  - Replace vh with dvh for full-height layouts
  - Use lvh for minimum heights
  - Use svh for maximum heights
  - Add vh fallback for unsupported browsers
  - Test on mobile devices with browser UI
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [ ] 10.5 Implement subgrid for nested layouts
  - Identify nested grids that need parent alignment
  - Add grid-template-columns: subgrid to child grids
  - Add fallback grid layout for unsupported browsers
  - Test subgrid alignment works correctly
  - _Requirements: 9.1, 9.2, 9.5_

- [ ] 10.6 Implement aspect-ratio property
  - Replace padding-bottom hacks with aspect-ratio
  - Use aspect-ratio for image containers (16/9, 4/3, 1/1)
  - Add padding-based fallback for unsupported browsers
  - Test aspect ratios maintain correctly
  - Use Chrome DevTools MCP to verify dimensions
  - _Requirements: 10.1, 10.2, 10.5_
  - _Tools: chrome-devtools_

- [ ] 10.7 Organize styles with cascade layers
  - Create @layer directives (reset, base, components, utilities)
  - Move component styles to @layer components
  - Move utility styles to @layer utilities
  - Ensure Tailwind layers are properly configured
  - Test layer ordering works correctly
  - _Requirements: 12.1, 12.2, 12.3_

- [ ] 10.8 Write property-based tests for modern CSS
  - **Property 19: :has() Selector for Parent Styling**
  - **Property 20: :is() Selector for Grouping**
  - **Property 21: color-mix() for Dynamic Colors**
  - **Property 22: Dynamic Viewport Units for Full Height**
  - **Property 23: Subgrid for Nested Grid Alignment**
  - **Property 24: aspect-ratio for Maintaining Proportions**
  - **Property 25: Cascade Layers for Style Organization**
  - **Validates: Requirements 6.1, 6.2, 7.1, 8.1, 9.1, 10.1, 12.1**

- [ ] 11. Checkpoint: Verify Phase 5 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Phase 6: Accessibility Verification (P0)
  - Verify WCAG 2.2 AAA compliance throughout refactor
  - _Requirements: 15.1-15.5_

- [ ] 12.1 Audit color contrast ratios
  - Use Chrome DevTools MCP to measure all text contrast ratios
  - Use Playwright MCP with axe-core to run automated accessibility audit
  - Identify any contrast failures (need 7:1 for normal, 4.5:1 for large)
  - Document required adjustments
  - _Requirements: 15.1_
  - _Tools: chrome-devtools, playwright_

- [ ] 12.2 Fix contrast ratio failures
  - Adjust text colors to meet WCAG AAA (7:1 for normal, 4.5:1 for large)
  - Adjust background colors if needed
  - Use Chrome DevTools MCP to verify contrast ratios after changes
  - Test in both light and dark modes
  - _Requirements: 15.1, 15.2_
  - _Tools: chrome-devtools_

- [ ] 12.3 Verify focus indicator contrast
  - Check all focus indicators have 3:1 contrast
  - Adjust focus ring colors if needed
  - Test keyboard navigation with Tab key
  - Use Chrome DevTools MCP to measure focus indicator contrast
  - _Requirements: 15.3_
  - _Tools: chrome-devtools_

- [ ] 12.4 Verify touch target sizes
  - Check all interactive elements have minimum 44x44px touch targets
  - Adjust button/link sizes if needed
  - Test on mobile devices
  - Use Chrome DevTools MCP to measure element dimensions
  - _Requirements: 15.4_
  - _Tools: chrome-devtools_

- [ ] 12.5 Test content reflow at 200% zoom
  - Test application at 200% browser zoom
  - Test on 320px wide viewport
  - Ensure no horizontal scrolling for primary content
  - Fix any reflow issues
  - _Requirements: 15.5_

- [ ] 12.6 Write property-based tests for accessibility
  - **Property 29: WCAG AAA Contrast Compliance**
  - **Property 30: Focus Indicator Contrast**
  - **Property 31: Touch Target Size**
  - **Validates: Requirements 15.1, 15.3, 15.4**

- [ ] 13. Checkpoint: Verify Phase 6 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Phase 7: Visual Regression Testing (P0)
  - Verify visual design is preserved
  - _Requirements: 16.1-16.5_

- [ ] 14.1 Comprehensive visual regression testing
  - Use Chrome DevTools MCP to take screenshots of all major pages
  - Take screenshots at mobile (375px), tablet (768px), desktop (1920px)
  - Compare with baseline screenshots from Phase 0
  - Document any visual differences
  - Verify differences are intentional and improve responsiveness
  - _Requirements: 16.1, 16.2, 16.3_
  - _Tools: chrome-devtools_

- [ ] 14.2 Test responsive behavior at all breakpoints
  - Test at sm (480px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)
  - Verify layouts adapt smoothly
  - Verify no content is cut off or overlapping
  - Use Chrome DevTools MCP device emulation
  - _Requirements: 16.4, 17.1, 17.4_
  - _Tools: chrome-devtools_

- [ ] 14.3 Test animations and transitions
  - Verify all animations still work correctly
  - Verify timing and easing feel the same
  - Test with prefers-reduced-motion enabled
  - _Requirements: 16.5_

- [ ] 14.4 Write property-based test for visual preservation
  - **Property 32: Visual Design Preservation**
  - **Validates: Requirements 16.1**

- [ ] 15. Checkpoint: Verify Phase 7 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Phase 8: Browser Compatibility Testing (P1)
  - Test across all supported browsers
  - _Requirements: 19.1-19.5_

- [ ] 16.1 Test on Chrome/Edge
  - Test all modern CSS features work correctly
  - Verify container queries, :has(), color-mix(), dvh, subgrid, aspect-ratio
  - Run E2E tests on Chrome
  - Document any issues
  - _Requirements: 19.1, 19.2_

- [ ] 16.2 Test on Firefox
  - Test all modern CSS features work correctly
  - Verify fallbacks work for unsupported features
  - Run E2E tests on Firefox
  - Document any issues
  - _Requirements: 19.1, 19.2_

- [ ] 16.3 Test on Safari
  - Test all modern CSS features work correctly
  - Verify fallbacks work for unsupported features
  - Test on iOS Safari if possible
  - Run E2E tests on WebKit
  - Document any issues
  - _Requirements: 19.1, 19.2_

- [ ] 16.4 Verify fallback strategies
  - Test application in browsers without modern CSS support
  - Verify fallbacks provide functional interface
  - Verify core functionality remains accessible
  - Document fallback behavior
  - _Requirements: 19.3, 19.4_

- [ ] 16.5 Write property-based test for browser compatibility
  - **Property 34: Browser Compatibility Fallbacks**
  - **Validates: Requirements 19.1**

- [ ] 17. Checkpoint: Verify Phase 8 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Phase 9: Performance Optimization (P1)
  - Verify and optimize performance
  - _Requirements: 20.1-20.5_

- [ ] 18.1 Measure baseline performance
  - Use Chrome DevTools MCP Performance panel
  - Measure render time, layout time, paint time
  - Measure CSS parse time
  - Measure bundle size
  - Document baseline metrics
  - _Requirements: 20.1_
  - _Tools: chrome-devtools_

- [ ] 18.2 Optimize clamp() and calc() usage
  - Review all clamp() and calc() usage
  - Simplify complex calculations if possible
  - Measure performance impact
  - Ensure no degradation from baseline
  - _Requirements: 20.1_

- [ ] 18.3 Optimize container query performance
  - Monitor performance of container queries on large component trees
  - Optimize container query usage if needed
  - Measure performance impact
  - _Requirements: 20.2_

- [ ] 18.4 Optimize selector complexity
  - Review all CSS selectors for complexity
  - Simplify overly complex selectors
  - Reduce nesting depth
  - Measure performance impact
  - _Requirements: 20.3_

- [ ] 18.5 Optimize CSS bundle size
  - Configure Tailwind purging for production
  - Remove unused CSS
  - Minify CSS with cssnano
  - Measure bundle size reduction
  - _Requirements: 20.5_

- [ ] 18.6 Write property-based test for performance
  - **Property 35: Performance Maintenance**
  - **Validates: Requirements 20.1**

- [ ] 19. Checkpoint: Verify Phase 9 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Phase 10: Documentation and Cleanup (P2)
  - Document changes and clean up code
  - _Requirements: 18.1-18.5, 21.1-21.5_

- [ ] 20.1 Document all px exceptions
  - Review all remaining px usage
  - Add comments explaining why px is necessary
  - Verify root font-size and hairline borders are documented
  - _Requirements: 18.1, 18.2, 18.3_

- [ ] 20.2 Update component documentation
  - Add JSDoc comments for new utilities
  - Document modern CSS patterns used
  - Update README with CSS modernization details
  - Document browser support and fallbacks
  - _Requirements: 18.4_

- [ ] 20.3 Remove obsolete code
  - Remove old float-based layout code
  - Remove old padding-bottom aspect ratio hacks
  - Remove old margin-based spacing code
  - Remove commented-out code
  - _Requirements: 21.1, 21.5_

- [ ] 20.4 Run final quality checks
  - Run `pnpm type-check` - verify zero errors
  - Run `pnpm lint` - verify zero errors and warnings
  - Run `pnpm test --run` - verify all tests pass
  - Run `pnpm test:e2e` - verify E2E tests pass
  - _Requirements: 23.1, 23.3, 23.4_

- [ ] 20.5 Write property-based tests for Tailwind integration
  - **Property 26: Tailwind Utility Preference**
  - **Property 27: rem-based Tailwind Extensions**
  - **Property 28: shadcn/ui Component Preservation**
  - **Validates: Requirements 13.1, 13.2, 14.1**

- [ ] 21. Checkpoint: Verify Phase 10 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Phase 11: Commit Changes (P2)
  - Create conventional commits
  - _Requirements: 21.2-21.4_

- [ ] 22.1 Commit typography refactor
  - `refactor(css): convert typography to relative units and fluid scaling`
  - Include: font-size conversions, clamp() implementation, line-height adjustments
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.2 Commit spacing refactor
  - `refactor(css): convert spacing to relative units and logical properties`
  - Include: padding/margin conversions, logical properties implementation
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.3 Commit layout refactor
  - `refactor(css): modernize layouts with flexbox, grid, and gap`
  - Include: float removal, flexbox/grid implementation, gap property usage
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.4 Commit container queries
  - `feat(css): implement container queries for component responsiveness`
  - Include: container query implementation, fallbacks
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.5 Commit modern CSS features
  - `feat(css): implement modern CSS features (:has, color-mix, dvh, subgrid, aspect-ratio)`
  - Include: modern selectors, color functions, viewport units, subgrid, aspect-ratio
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.6 Commit cascade layers
  - `refactor(css): organize styles with cascade layers`
  - Include: @layer implementation, style organization
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.7 Commit accessibility improvements
  - `fix(a11y): ensure WCAG 2.2 AAA compliance after CSS modernization`
  - Include: contrast ratio fixes, focus indicator improvements, touch target adjustments
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 22.8 Commit tests and documentation
  - `test: add property-based tests for CSS modernization`
  - `docs: update documentation for modern CSS patterns`
  - Include: all property-based tests, updated documentation
  - _Requirements: 21.2, 21.3, 21.4_

- [ ] 23. Final Verification
  - Comprehensive testing and sign-off
  - _Requirements: All_

- [ ] 23.1 Final comprehensive testing
  - Use Chrome DevTools MCP to test all features
  - Test on all supported browsers (Chrome, Firefox, Safari, Edge)
  - Test at all breakpoints (mobile, tablet, desktop)
  - Test in both light and dark modes
  - Test with keyboard navigation
  - Test with screen reader
  - Verify all 35 properties have passing tests
  - _Tools: chrome-devtools, playwright_

- [ ] 23.2 Final automated testing
  - Run all quality checks one last time
  - Verify zero errors and zero warnings
  - Verify 80% test coverage
  - Verify all E2E tests pass on all browsers

- [ ] 23.3 Confirm completion
  - Review all commits
  - Verify all 23 requirements are met
  - Confirm CSS modernization is complete
  - Document any known limitations or future improvements
  - Celebrate! 🎉
