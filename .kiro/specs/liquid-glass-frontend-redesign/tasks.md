# Implementation Plan

## Overview

This implementation plan breaks down the liquid glass frontend redesign into discrete, manageable tasks. Each task builds incrementally on previous work, with checkpoints to ensure all tests pass before proceeding.

## Technology Stack

**Core Technologies:**
- **React 19.2**: Latest React with concurrent features, use() hook, and enhanced Suspense
- **shadcn/ui**: Accessible, customizable component library built with Radix UI and Tailwind CSS
- **Tailwind CSS 4.1**: Native cascade layers, container queries, and improved JIT compilation
- **TypeScript 5.3+**: Strict mode with comprehensive type safety
- **framer-motion**: Spring physics-based fluid animations
- **Vitest**: Fast unit testing with happy-dom
- **Playwright**: E2E testing with cross-browser support

**Development Tools (MCP):**
- **shadcn MCP**: Component discovery, search, and installation commands
- **Playwright MCP**: Automated browser testing and interaction verification
- **Chrome DevTools MCP**: Real-time debugging, contrast checking, performance profiling
- **Sequential Thinking MCP**: Problem-solving, architectural planning, and decision-making
- **Serena MCP**: Code analysis, symbol search, refactoring, and file management

## Key Principles

1. **Use React 19.2 Features**: Leverage use() hook, automatic batching, concurrent rendering
2. **Use shadcn/ui Components**: Prioritize shadcn/ui components for all UI elements to ensure accessibility and consistency
3. **Use Tailwind CSS 4.1 Features**: Utilize cascade layers, container queries, native nesting
4. **Use MCP Tools Extensively**: Every complex task should use Sequential Thinking MCP for planning
5. **Discover Components with shadcn MCP**: Use shadcn MCP to search and install components
6. **Verify with DevTools**: Use Chrome DevTools MCP to verify contrast, layout, and performance
7. **Test with Playwright**: Use Playwright MCP for automated E2E testing
8. **Refactor with Serena**: Use Serena MCP for code analysis and refactoring

## Development Tools and Best Practices

### MCP Tools Usage

**Always use these tools to enhance development quality:**

1. **shadcn MCP** (Component Discovery)
   - `mcp_shadcn_search_items_in_registries`: Search for components
   - `mcp_shadcn_view_items_in_registries`: View component details
   - `mcp_shadcn_get_item_examples_from_registries`: Find usage examples
   - `mcp_shadcn_get_add_command_for_items`: Get installation commands

2. **Sequential Thinking MCP** (`mcp_sequential_thinking_sequentialthinking`)
   - Use BEFORE implementing complex changes
   - Break down problems into steps
   - Consider multiple approaches
   - Identify edge cases and potential issues
   - Plan the optimal solution

3. **Serena MCP** (Code Analysis)
   - `mcp_serena_get_symbols_overview`: Understand file structure
   - `mcp_serena_find_symbol`: Locate components and functions
   - `mcp_serena_search_for_pattern`: Find all usages of patterns
   - `mcp_serena_find_referencing_symbols`: Identify dependencies
   - `mcp_serena_replace_symbol_body`: Refactor implementations

4. **Chrome DevTools MCP** (Browser Debugging)
   - `mcp_chrome_devtools_navigate`: Load the application
   - `mcp_chrome_devtools_take_snapshot`: Verify accessibility structure
   - `mcp_chrome_devtools_evaluate_script`: Measure styles, contrast, dimensions
   - `mcp_chrome_devtools_take_screenshot`: Capture visual state
   - `mcp_chrome_devtools_list_console_messages`: Check for errors

5. **Playwright MCP** (Automated Testing)
   - `mcp_microsoft_playwright_mcp_browser_navigate`: Test navigation
   - `mcp_microsoft_playwright_mcp_browser_snapshot`: Verify layout
   - `mcp_microsoft_playwright_mcp_browser_click`: Test interactions
   - `mcp_microsoft_playwright_mcp_browser_evaluate`: Check DOM state

### Recommended Workflow for Each Task

```
1. DISCOVER (shadcn MCP)
   → Search for required shadcn/ui components
   → View component examples and documentation
   → Get installation commands

2. ANALYZE (Serena MCP)
   → Understand current code structure
   → Find all related components and usages

3. THINK (Sequential Thinking MCP)
   → Break down the problem
   → Consider multiple approaches
   → Plan the optimal solution

4. IMPLEMENT
   → Install shadcn/ui components if needed
   → Make code changes following the plan
   → Use Serena MCP for refactoring

5. VERIFY (Chrome DevTools MCP)
   → Inspect the result in browser
   → Measure dimensions, contrast, z-index
   → Check console for errors

6. TEST (Playwright MCP)
   → Run automated tests
   → Verify behavior across browsers

7. ITERATE
   → Refine based on findings
   → Use Sequential Thinking for complex issues
```

## Task List

- [x] 0. Phase 0: Setup shadcn/ui (P0)
  - Initialize shadcn/ui and install required components
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 0.1 Initialize shadcn/ui in the project
  - Use shadcn MCP to get project registries: `mcp_shadcn_get_project_registries`
  - Run `npx shadcn@latest init` to set up shadcn/ui configuration
  - Configure components.json with Tailwind CSS 4.1 settings
  - Verify installation by checking components.json exists
  - _Requirements: 2.1_
  - _Tools: shadcn_

- [x] 0.2 Discover and install core shadcn/ui components
  - Use shadcn MCP to search for required components:
    - `mcp_shadcn_search_items_in_registries` for: button, card, sheet, input, dropdown-menu, breadcrumb, scroll-area
  - Use `mcp_shadcn_view_items_in_registries` to review component details
  - Use `mcp_shadcn_get_add_command_for_items` to get installation commands
  - Install components: button, card, sheet, input, dropdown-menu, breadcrumb, scroll-area, dialog, alert, skeleton, tabs, tooltip, switch, select
  - Verify components are installed in components/ui directory
  - _Requirements: 2.1, 2.2_
  - _Tools: shadcn_

- [x] 0.3 Review shadcn/ui component examples
  - Use `mcp_shadcn_get_item_examples_from_registries` to find usage examples
  - Review examples for: card-demo, sheet-demo, button-demo, input-demo
  - Document component patterns for team reference
  - Test basic component rendering
  - _Requirements: 2.1_
  - _Tools: shadcn_

- [x] 0.4 Create Glass wrapper components with modern CSS
  - Use Sequential Thinking MCP to plan Glass wrapper architecture
  - Create GlassCard component wrapping shadcn/ui Card
  - Create GlassSheet component wrapping shadcn/ui Sheet
  - Create GlassButton component wrapping shadcn/ui Button
  - Apply glass effect styling using modern CSS:
    - Use clamp() for responsive padding and sizing
    - Use container queries for adaptive glass effects
    - Use logical properties (padding-inline, margin-block)
    - Use color-mix() for dynamic glass colors
    - Use dvh for full-height layouts
    - Use gap for flex layouts
  - Apply backdrop-blur, opacity, borders with cascade layers
  - Ensure WCAG AAA contrast compliance with Chrome DevTools MCP
  - Test in both light and dark modes
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 20.1-20.10_
  - _Tools: sequential-thinking, chrome-devtools_

- [x] 0.5 Write unit tests for Glass wrapper components
  - Test GlassCard renders with correct intensity levels
  - Test GlassSheet opens and closes correctly
  - Test theme switching updates Glass components
  - Verify accessibility attributes are preserved
  - Test modern CSS features are applied (clamp, container queries, logical properties)
  - _Requirements: 2.1, 2.3, 20.1-20.10_

- [x] 0.6 Write property-based tests for modern CSS features
  - **Property 36: Responsive Typography Uses clamp()**
  - **Property 37: Component Responsiveness Uses Container Queries**
  - **Property 38: Spacing Uses Logical Properties**
  - **Property 39: Full-Height Layouts Use Dynamic Viewport Units**
  - **Property 40: Flex Layouts Use Gap Property**
  - **Validates: Requirements 20.1, 20.2, 20.3, 20.6, 20.9**

- [x] 1. Checkpoint: Verify Phase 0 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 2. Phase 1: Fix Critical Layout Issues (P0)
  - Fix Header, Sidebar, and main content positioning and alignment
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.1 Migrate Header to shadcn/ui with modern CSS
  - Use shadcn MCP to search for button, dropdown-menu, breadcrumb components
  - Use Serena MCP to analyze Header.tsx structure and dependencies
  - Use Sequential Thinking MCP to plan migration strategy
  - Replace custom buttons with shadcn/ui Button components
  - Replace custom dropdowns with shadcn/ui DropdownMenu
  - Replace custom breadcrumbs with shadcn/ui Breadcrumb
  - Apply GlassCard wrapper to Header container
  - Refactor Header styles to use modern CSS:
    - Use clamp() for responsive height and padding
    - Use logical properties (padding-inline)
    - Use gap for flex layouts
    - Use :has() selector for conditional styling
  - Ensure sticky positioning works correctly (top-0, z-30)
  - Use Chrome DevTools MCP to verify positioning, z-index, and contrast
  - Use Playwright MCP to test responsive behavior on mobile, tablet, and desktop
  - _Requirements: 1.1, 2.1, 2.3, 20.1, 20.3, 20.9_
  - _Tools: shadcn, serena, sequential-thinking, chrome-devtools, playwright_

- [x] 2.2 Migrate Sidebar to shadcn/ui Sheet with modern CSS
  - Use shadcn MCP to view Sheet component examples
  - Use Serena MCP to analyze Sidebar.tsx and find all component usages
  - Use Sequential Thinking MCP to plan Sheet integration
  - Replace custom Sidebar with shadcn/ui Sheet component
  - Use SheetContent for the sidebar container
  - Replace search input with shadcn/ui Input component
  - Replace conversation list with shadcn/ui ScrollArea
  - Apply GlassSheet wrapper with 'high' intensity
  - Refactor Sidebar styles to use modern CSS:
    - Use dvh for full-height layout (height: 100dvh)
    - Use logical properties (padding-inline, margin-block)
    - Use gap for flex layouts
    - Use container queries for responsive behavior
    - Use color-mix() for overlay colors
  - Ensure Sidebar width is exactly 320px (w-80) when open
  - Use Chrome DevTools MCP to measure actual width and verify glass effects
  - Verify Sheet overlay and animations work correctly
  - Use Playwright MCP to test overlay backdrop on mobile
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 20.2, 20.3, 20.5, 20.6, 20.9_
  - _Tools: shadcn, serena, sequential-thinking, chrome-devtools, playwright_

- [x] 2.3 Fix main content area positioning and overlap
  - Use Serena MCP to analyze AppLayout.tsx component structure
  - Use Sequential Thinking MCP to plan layout fix strategy
  - Review AppLayout.tsx for content area positioning
  - Ensure main content doesn't overlap with Header or Sidebar
  - Use Chrome DevTools MCP to inspect bounding boxes and z-index values
  - Verify z-index values are properly ordered (Header: 30, Sidebar: 40, Main: 10)
  - Use Playwright MCP to test content expansion when Sidebar closes on desktop
  - _Requirements: 1.3, 1.5_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 2.4 Fix responsive breakpoint behavior
  - Review useEffect hooks for window resize handling
  - Ensure breakpoints are correctly defined
  - Fix auto-close Sheet (Sidebar) on mobile when screen size changes
  - Test orientation changes with shadcn/ui Sheet
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2.5 Standardize Glass wrapper component usage
  - Use Serena MCP to audit all components using Glass wrappers
  - Ensure consistent intensity levels across GlassCard and GlassSheet
  - Verify border prop is used consistently
  - Test theme switching for all Glass components
  - Verify shadcn/ui accessibility features are preserved
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Tools: serena_

- [x] 2.6 Write property-based test for Glass styling
  - **Property 5: Glass Intensity Styling**
  - **Validates: Requirements 2.1**

- [x] 2.7 Write property-based test for theme-dependent styling
  - **Property 7: Theme-Dependent Glass Styling**
  - **Validates: Requirements 2.3**

- [x] 2.8 Update unit tests for shadcn/ui components
  - Update Header tests for shadcn/ui Button, DropdownMenu, Breadcrumb
  - Update Sidebar tests for shadcn/ui Sheet, Input, ScrollArea
  - Update AppLayout tests
  - Test Glass wrapper components
  - Ensure all tests pass with zero errors and warnings

- [x] 2.9 Update E2E tests for shadcn/ui layout
  - Update tests for Header with shadcn/ui components
  - Update tests for Sidebar Sheet component
  - Test responsive behavior at all breakpoints
  - Verify accessibility with shadcn/ui components

- [x] 3. Checkpoint: Verify Phase 1 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 2: Ensure Accessibility Compliance (P0)
  - Audit and fix color contrast ratios
  - Fix focus indicators
  - Add missing ARIA labels
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4.1 Audit color contrast ratios with shadcn/ui components
  - Use Chrome DevTools MCP to evaluate computed styles and measure contrast ratios
  - Use Playwright MCP with axe-core to run automated accessibility audit
  - Use Sequential Thinking MCP to analyze contrast failures and plan fixes
  - Identify all contrast failures (need 7:1 for normal text, 4.5:1 for large)
  - Document required adjustments with current and target ratios
  - _Requirements: 4.1_
  - _Tools: chrome-devtools, playwright, sequential-thinking_

- [x] 4.2 Fix text color contrast issues
  - Use Serena MCP to find all text color usages across components
  - Use Sequential Thinking MCP to plan color adjustments that maintain design aesthetic
  - Update text colors to meet WCAG AAA (7:1 for normal, 4.5:1 for large)
  - Use Chrome DevTools MCP to verify contrast ratios after changes
  - Test in both light and dark modes with DevTools theme emulation
  - _Requirements: 4.1_
  - _Tools: serena, sequential-thinking, chrome-devtools_

- [x] 4.3 Fix focus indicator contrast
  - Ensure focus indicators have 3:1 contrast
  - Update focus styles
  - Test in high contrast mode
  - _Requirements: 4.2, 4.4_

- [x] 4.4 Verify ARIA labels in shadcn/ui components
  - Add aria-label to icon-only buttons
  - Add role attributes
  - Add aria-live regions
  - _Requirements: 4.3_

- [x] 4.5 Verify keyboard navigation with shadcn/ui
  - Test Tab navigation
  - Implement arrow key navigation for lists
  - Add Home/End key support
  - _Requirements: 4.2_

- [x] 4.6 Test with screen readers
  - Test with NVDA or VoiceOver
  - Verify announcements
  - Fix any issues found
  - _Requirements: 4.3_

- [x] 4.7 Write property-based test for contrast
  - **Property 12: Text Contrast Ratio Compliance**
  - **Validates: Requirements 4.1**

- [x] 4.8 Write property-based test for keyboard navigation
  - **Property 13: Keyboard Navigation Completeness**
  - **Validates: Requirements 4.2, 4.4**

- [x] 4.9 Update E2E tests for accessibility
  - Add axe-core checks
  - Test keyboard navigation flows

- [x] 5. Checkpoint: Verify Phase 2 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 3: Fix Search Functionality with shadcn/ui (P1)
  - Fix search result highlighting
  - Implement pagination
  - Fix keyboard navigation
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6.1 Migrate search to shadcn/ui Input and implement highlighting
  - Use Serena MCP to analyze ConversationSearch.tsx and SearchResultItem.tsx
  - Use Sequential Thinking MCP to design highlighting algorithm
  - Implement keyword highlighting with HTML markup (<mark> or <span>)
  - Style highlighted keywords (WCAG AAA compliant colors)
  - Use Chrome DevTools MCP to verify highlighting and contrast ratios
  - Use Playwright MCP to test with various search queries
  - _Requirements: 8.1_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 6.2 Implement search pagination with shadcn/ui Button
  - Implement Previous/Next buttons
  - Add page number display
  - Add ARIA labels
  - _Requirements: 8.2_

- [x] 6.3 Fix keyboard navigation in search
  - Implement arrow key navigation
  - Implement Home/End keys
  - Implement Enter/Escape keys
  - _Requirements: 8.5_

- [x] 6.4 Add ARIA live regions for search
  - Add aria-live to results container
  - Announce result count changes
  - _Requirements: 8.4_

- [x] 6.5 Fix search result navigation
  - Ensure clicking navigates correctly
  - Close search after navigation
  - _Requirements: 8.3_

- [x] 6.6 Write property-based tests for search
  - **Property 19-23: Search functionality**
  - **Validates: Requirements 8.1-8.5**

- [x] 6.7 Update E2E tests for search
  - Test search input and results
  - Test pagination and keyboard navigation

- [x] 7. Checkpoint: Verify Phase 3 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase 4: Ensure i18n Support (P1)
  - Test language switching
  - Add missing translations
  - Verify date formatting
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8.1 Verify language detection
  - Test browser language detection
  - Test language persistence
  - _Requirements: 5.1_

- [x] 8.2 Test language switching
  - Test English/Chinese switching
  - Verify immediate updates
  - _Requirements: 5.2_

- [x] 8.3 Add missing translation keys
  - Audit for hardcoded text
  - Add translations for English and Chinese
  - _Requirements: 5.5_

- [x] 8.4 Verify date formatting
  - Test date/time formatting for locales
  - Test relative time formatting
  - _Requirements: 5.3_

- [x] 8.5 Write property-based tests for i18n
  - **Property 15-17: i18n functionality**
  - **Validates: Requirements 5.2-5.4**

- [x] 9. Checkpoint: Verify Phase 4 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 5: Optimize Performance (P2)
  - Add React.memo
  - Implement virtualization
  - Add debouncing
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 10.1 Add React.memo to expensive components
  - Wrap ConversationList, MessageList
  - Verify re-render count decreases
  - _Requirements: 6.5_

- [x] 10.2 Implement virtualization with shadcn/ui ScrollArea
  - Ensure react-window for lists > 50 items
  - Test scrolling performance
  - _Requirements: 6.2, 6.5_

- [x] 10.3 Add debouncing
  - Add debounce to search input
  - Add debounce to resize handler
  - _Requirements: 6.3_

- [x] 10.4 Optimize bundle size
  - Use React.lazy for non-critical components
  - Verify bundle size reduction
  - _Requirements: 6.1_

- [x] 10.5 Write property-based test for virtualization
  - **Property 18: Large List Virtualization**
  - **Validates: Requirements 6.5**

- [x] 11. Checkpoint: Verify Phase 5 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Phase 6: Write Remaining PBT (P2)
  - Write all remaining property-based tests
  - _Requirements: 7.1-7.5_

- [x] 12.1 Write PBT for layout properties
  - **Property 1-4: Layout consistency**
  - **Validates: Requirements 1.2-1.5**

- [x] 12.2 Write PBT for Glass properties
  - **Property 6, 8-11: Glass styling**
  - **Validates: Requirements 2.2-3.5**

- [x] 12.3 Write PBT for utility functions
  - **Property 24: ClassName utility**
  - **Validates: Requirements 9.5**

- [x] 13. Checkpoint: Verify Phase 6 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Phase 7: Code Cleanup (P3)
  - Remove commented code
  - Consolidate utilities
  - Run quality checks
  - _Requirements: 7.1-7.5, 11.1-11.5_

- [x] 14.1 Remove commented code and debug statements
  - Use Serena MCP to search for commented code patterns
  - Use Serena MCP to find all console.log and debugger statements
  - Review and remove or document intentional commented code
  - Remove console.log statements (except in logger utility)
  - Remove debugger statements
  - _Requirements: 11.5_
  - _Tools: serena_

- [x] 14.2 Consolidate duplicate utilities
  - Use Serena MCP to search for duplicate utility functions
  - Use Sequential Thinking MCP to plan consolidation strategy
  - Consolidate into shared utilities in utils directory
  - Use Serena MCP to update imports across all components
  - Test that functionality still works
  - _Requirements: 11.1_
  - _Tools: serena, sequential-thinking_

- [x] 14.3 Update documentation
  - Update JSDoc comments
  - Update README if needed
  - _Requirements: 11.4_

- [x] 14.4 Run TypeScript type-check
  - Run `pnpm type-check`
  - Fix errors without suppressions
  - _Requirements: 7.3_

- [x] 14.5 Run ESLint
  - Run `pnpm lint`
  - Fix all errors and warnings
  - _Requirements: 7.4_

- [x] 14.6 Run all unit tests
  - Run `pnpm test --run`
  - Verify 80% coverage
  - _Requirements: 7.1, 7.5_

- [x] 14.7 Run all E2E tests
  - Run `pnpm test:e2e`
  - Test on all browsers
  - _Requirements: 7.2_

- [x] 15. Checkpoint: Verify Phase 7 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Phase 8: Commit Changes (P3)
  - Create conventional commits
  - _Requirements: 11.2-11.4_

- [x] 16.1 Commit shadcn/ui setup and layout fixes
  - `fix(layout): fix critical layout issues`
  - _Requirements: 11.2, 11.3_

- [x] 16.2 Commit Glass improvements with shadcn/ui
  - `feat(ui): standardize Glass component`
  - _Requirements: 11.2, 11.3_

- [x] 16.3 Commit accessibility improvements
  - `feat(a11y): implement WCAG AAA compliance`
  - _Requirements: 11.2, 11.3_

- [x] 16.4 Commit search fixes with shadcn/ui
  - `fix(search): implement highlighting and pagination`
  - _Requirements: 11.2, 11.3_

- [x] 16.5 Commit i18n improvements
  - `feat(i18n): enhance language switching`
  - _Requirements: 11.2, 11.3_

- [x] 16.6 Commit performance optimizations
  - `perf: optimize rendering`
  - _Requirements: 11.2, 11.3_

- [x] 16.7 Commit test additions
  - `test: add comprehensive PBT and E2E tests`
  - _Requirements: 11.2, 11.3_

- [x] 16.8 Commit code cleanup
  - `chore: remove commented code and update docs`
  - _Requirements: 11.2, 11.3_

- [x] 17. Final Verification
  - Manual and automated testing
  - _Requirements: All_

- [x] 17.1 Final manual testing
  - Use Chrome DevTools MCP to navigate and test all flows
  - Use DevTools device emulation to test mobile, tablet, desktop
  - Use DevTools theme emulation to test light/dark modes
  - Test language switching (English/Chinese)
  - Use Chrome DevTools MCP to capture screenshots for documentation
  - Use Playwright MCP to run final E2E test suite
  - _Tools: chrome-devtools, playwright_

- [x] 17.2 Final automated testing
  - Run all quality checks
  - Verify zero errors and warnings

- [x] 17.3 Confirm completion
  - Review commit history
  - Verify all requirements met
  - Confirm migration complete

- [x] 18. Phase 9: Implement Advanced Liquid Glass Features with shadcn/ui (P0)
  - Implement dynamic optical effects, fluid animations, and scroll behaviors
  - _Requirements: 13.1-13.5, 14.1-14.5, 15.1-15.5, 16.1-16.5, 17.1-17.5, 18.1-18.5_

- [x] 18.1 Set up animation system with framer-motion and React 19.2
  - Use Serena MCP to audit current animation usage
  - Use Sequential Thinking MCP to plan animation system architecture
  - Install and configure framer-motion library (latest version)
  - Create animation configuration constants (spring presets)
  - Create useSpringAnimation custom hook using React 19.2's use() hook for resource management
  - Implement prefers-reduced-motion detection with automatic batching
  - Create useAccessibleAnimation hook that respects user preferences
  - Leverage React 19.2's concurrent rendering for non-blocking animations
  - Use React 19.2's automatic batching for smooth multi-property animations
  - Document animation system in code comments with examples
  - Test with prefers-reduced-motion enabled and disabled
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - _Tools: serena, sequential-thinking_
  - _React 19.2 Features: use() hook, automatic batching, concurrent rendering_

- [x] 18.2 Implement fluid button animations with shadcn/ui Button
  - Use Serena MCP to find all button components
  - Wrap buttons with framer-motion's motion component
  - Apply spring physics to hover, active, and focus states
  - Add scale and brightness animations on interaction
  - Test animations feel organic and satisfying
  - _Requirements: 14.1_

- [x] 18.3 Implement fluid switch and slider animations with shadcn/ui Switch
  - Apply spring physics to switch toggle animations
  - Add gel-like flexibility to slider thumb movement
  - Implement bounce effect on value changes
  - Test animations with various interaction speeds
  - _Requirements: 14.2_

- [x] 18.4 Implement dynamic Header scroll behavior with React 19.2 and Tailwind CSS 4.1
  - Use Sequential Thinking MCP to plan scroll detection strategy
  - Create useScrollBehavior custom hook using React 19.2's use() hook
  - Implement scroll direction detection with velocity calculation
  - Use React 19.2's concurrent rendering for non-blocking scroll calculations
  - Add Header height reduction on scroll down (from 64px to 48px)
  - Add Header expansion on scroll up
  - Use framer-motion for smooth height transitions with spring physics
  - Use Tailwind CSS 4.1's container queries for responsive Header behavior
  - Implement with Tailwind CSS 4.1's cascade layers for clean style organization
  - Use React 19.2's automatic batching for smooth multi-property updates
  - Ensure essential controls remain visible when collapsed
  - Test scroll behavior with Chrome DevTools MCP performance profiling
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - _Tools: sequential-thinking, chrome-devtools_
  - _React 19.2 Features: use() hook, automatic batching, concurrent rendering_
  - _Tailwind CSS 4.1 Features: container queries, cascade layers_

- [x] 18.5 Implement in-place dialog expansion with shadcn/ui Dialog
  - Use Serena MCP to find all dialog and alert components
  - Calculate trigger button's bounding rectangle
  - Set transform-origin to button's center coordinates
  - Implement scale animation from 0 to 1 with spring physics
  - Add backdrop blur animation synchronized with dialog
  - Test with various button positions (corners, center, edges)
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  - _Tools: serena_

- [x] 18.6 Implement dynamic Glass optical adaptation with React 19.2 and Tailwind CSS 4.1
  - Use Sequential Thinking MCP to plan brightness detection algorithm
  - Create useBackgroundBrightness custom hook using React 19.2's use() hook
  - Implement canvas-based brightness sampling with concurrent rendering
  - Create useContrastValidation hook for real-time WCAG AAA validation
  - Use Tailwind CSS 4.1's cascade layers to organize Glass styles
  - Implement container queries for responsive Glass effects
  - Adjust Glass opacity based on background brightness while maintaining 7:1 contrast
  - Use React 19.2's automatic batching for smooth opacity transitions
  - Add automatic fallback to solid backgrounds when contrast cannot be maintained
  - Use Tailwind CSS 4.1's native CSS variables for dynamic opacity
  - Add smooth transitions when brightness changes
  - Test with various background colors and images
  - Use Chrome DevTools MCP to verify contrast ratios in all states
  - Use Chrome DevTools MCP to profile performance of brightness detection
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - _Tools: sequential-thinking, chrome-devtools_
  - _React 19.2 Features: use() hook, automatic batching, concurrent rendering_
  - _Tailwind CSS 4.1 Features: cascade layers, container queries, CSS variables_

- [x] 18.7 Implement mobile bottom search positioning with shadcn/ui Input
  - Use Serena MCP to analyze current search component
  - Create responsive search positioning logic
  - Position search at bottom 20% on mobile (< 768px)
  - Add keyboard appearance detection and adjustment
  - Ensure search doesn't obstruct content
  - Test in portrait and landscape orientations
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - _Tools: serena_

- [x] 18.8 Implement scroll edge visual effects
  - Create useScrollEdge custom hook
  - Detect proximity to top/bottom edges (within 10px)
  - Render gradient overlays at edges
  - Animate opacity based on distance from edge
  - Add smooth fade in/out transitions
  - Test with various content heights
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 18.9 Write property-based test for scroll behavior
  - **Property 25: Dynamic Toolbar Scroll Behavior**
  - **Validates: Requirements 15.1, 15.2**

- [x] 18.10 Write property-based test for fluid animations
  - **Property 26: Fluid Animation Spring Physics**
  - **Validates: Requirements 14.1, 14.2**

- [x] 18.11 Write property-based test for in-place dialogs
  - **Property 27: In-Place Dialog Expansion**
  - **Validates: Requirements 16.1, 16.2, 16.4**

- [x] 18.12 Write property-based test for mobile search
  - **Property 28: Mobile Bottom Search Positioning**
  - **Validates: Requirements 17.1, 17.2**

- [x] 18.13 Write property-based test for Glass adaptation
  - **Property 29: Dynamic Glass Optical Adaptation**
  - **Validates: Requirements 13.2**

- [x] 18.14 Write property-based test for scroll edges
  - **Property 35: Scroll Edge Visual Feedback**
  - **Validates: Requirements 19.1, 19.2**

- [x] 18.15 Write property-based tests for Light/Dark mode
  - **Property 10: Light Mode Contrast Compliance**
  - **Property 11: Dark Mode Contrast Compliance**
  - **Property 12: Light Mode Glass Opacity**
  - **Property 13: Dark Mode Glass Opacity**
  - **Property 14: Theme Persistence**
  - **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.9**

- [x] 18.16 Update unit tests for shadcn/ui components with new features
  - Update Header tests for scroll behavior
  - Update Glass component tests for optical adaptation
  - Update button tests for fluid animations
  - Ensure all tests pass with zero errors and warnings

- [x] 18.19 Update E2E tests for shadcn/ui interactions and accessibility
  - Test Header collapse/expand on scroll
  - Test in-place dialog animations
  - Test mobile bottom search positioning
  - Test scroll edge indicators
  - Verify animations are smooth and performant
  - Test with prefers-reduced-motion enabled
  - Verify keyboard navigation works with all new features
  - Test screen reader announcements with Playwright axe-core
  - Verify focus management in animated dialogs
  - Test touch target sizes on mobile (minimum 44x44px)
  - Verify contrast ratios meet WCAG AAA in all states

- [x] 18.17 Comprehensive Light/Dark Mode Testing with shadcn/ui
  - Use Chrome DevTools MCP to test both light and dark modes
  - Use Chrome DevTools theme emulation to switch between modes
  - Verify all text meets WCAG AAA contrast in light mode (7:1 for normal, 4.5:1 for large)
  - Verify all text meets WCAG AAA contrast in dark mode (7:1 for normal, 4.5:1 for large)
  - Test Glass component opacity in both modes (bg-white/10-70 and bg-black/10-70)
  - Verify focus indicators have 3:1 contrast in both modes
  - Test theme switching transitions are smooth
  - Verify theme preference persists across sessions
  - Use Playwright MCP to automate contrast testing in both modes
  - Document any contrast failures and fix immediately
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  - _Tools: chrome-devtools, playwright_

- [x] 18.18 Comprehensive WCAG AAA accessibility audit with shadcn/ui
  - Use Chrome DevTools MCP to audit all pages with Lighthouse
  - Use Playwright MCP with axe-core to run automated accessibility tests
  - Manually test all new features with keyboard only (no mouse)
  - Test with screen reader (VoiceOver on macOS or NVDA on Windows)
  - Verify all contrast ratios meet WCAG AAA (7:1 for normal text, 4.5:1 for large)
  - Test with prefers-reduced-motion enabled
  - Test with high contrast mode enabled
  - Verify focus indicators have 3:1 contrast ratio
  - Test touch target sizes on mobile (minimum 44x44px)
  - Document any accessibility issues found and fix immediately
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 14.1, 15.2, 16.3, 17.1, 18.2_
  - _Tools: chrome-devtools, playwright_

- [x] 19. Checkpoint: Verify Phase 9 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Phase 10: Performance Optimization and Polish (P1)
  - Optimize animations, add fallbacks, and polish details
  - _Requirements: 13.5, 14.5_

- [x] 20.1 Add backdrop-filter fallbacks
  - Detect backdrop-filter support
  - Provide solid background fallback
  - Test in browsers without support
  - _Requirements: 13.5_

- [x] 20.2 Optimize animation performance
  - Use will-change CSS property for animated elements
  - Ensure animations use transform and opacity only
  - Add reduced-motion media query support
  - Profile animation performance with Chrome DevTools
  - _Requirements: 14.5_

- [x] 20.3 Add loading states with shadcn/ui Skeleton and fluid animations
  - Implement skeleton screens with pulse animation
  - Add spring-based loading spinners
  - Ensure loading states feel organic
  - _Requirements: 14.3_

- [x] 20.4 Polish micro-interactions with shadcn/ui
  - Add haptic feedback simulation (visual bounce)
  - Refine animation timing and easing
  - Test all interactions feel delightful
  - _Requirements: 14.4_

- [x] 20.5 Run performance audit
  - Use Chrome DevTools Performance panel
  - Measure animation frame rates (target 60fps)
  - Identify and fix performance bottlenecks
  - Verify memory usage is stable

- [x] 21. Checkpoint: Verify Phase 10 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Phase 11: Final Code Cleanup and Documentation (P2)
  - Clean up code, update documentation, and prepare for commit
  - _Requirements: 11.1-11.5_

- [x] 22.1 Update component documentation for shadcn/ui integration
  - Add JSDoc comments for new hooks and components
  - Document animation system usage
  - Document scroll behavior system
  - Update README with new features

- [x] 22.2 Run final quality checks
  - Run `pnpm type-check` - verify zero errors
  - Run `pnpm lint` - verify zero errors and warnings
  - Run `pnpm test --run` - verify all tests pass
  - Run `pnpm test:e2e` - verify E2E tests pass

- [x] 22.3 Review and clean up code
  - Remove any debug code or console.logs
  - Ensure consistent code style
  - Verify all comments are meaningful
  - Check for any TODO comments

- [x] 23. Checkpoint: Verify Phase 11 completion
  - Ensure all tests pass, ask the user if questions arise.

- [-] 24. Phase 12: Commit Advanced Features (P2)
  - Create conventional commits for new features
  - _Requirements: 11.2-11.4_

- [x] 24.1 Commit animation system with shadcn/ui components
  - `feat(animation): implement fluid animation system with spring physics`
  - _Requirements: 11.2, 11.3_

- [x] 24.2 Commit dynamic scroll behavior
  - `feat(layout): implement dynamic Header scroll behavior`
  - _Requirements: 11.2, 11.3_

- [x] 24.3 Commit in-place interactions with shadcn/ui Dialog
  - `feat(ui): implement in-place dialog expansion`
  - _Requirements: 11.2, 11.3_

- [x] 24.4 Commit optical effects
  - `feat(glass): implement dynamic Glass optical adaptation`
  - _Requirements: 11.2, 11.3_

- [x] 24.5 Commit mobile optimizations with shadcn/ui
  - `feat(mobile): optimize touch reachability with bottom search`
  - _Requirements: 11.2, 11.3_

- [x] 24.6 Commit scroll edge effects
  - `feat(ui): implement scroll edge visual feedback`
  - _Requirements: 11.2, 11.3_

- [-] 24.7 Commit tests and documentation
  - `test: add PBT for advanced Liquid Glass features`
  - `docs: update documentation for new features`
  - _Requirements: 11.2, 11.3_

- [ ] 25. Phase 13: Improve Sidebar UX and Discoverability (P0)
  - Implement enhanced sidebar access with floating button, tooltips, and onboarding
  - _Requirements: 21.1-21.10_

- [x] 25.1 Fix desktop Sidebar default open state
  - Use Serena MCP to analyze AppLayout.tsx and Sidebar state management
  - Use Sequential Thinking MCP to plan default state logic for different viewports
  - Modify initial Sidebar state to be open by default on desktop (> 1024px)
  - Ensure Sidebar remains closed by default on mobile/tablet (≤ 1024px)
  - Test with Chrome DevTools MCP device emulation at various viewport sizes
  - Verify state persists correctly across viewport changes
  - _Requirements: 21.1_
  - _Tools: serena, sequential-thinking, chrome-devtools_

- [x] 25.2 Enhance hamburger menu button visual prominence
  - Use Serena MCP to locate hamburger menu button in Header.tsx
  - Add enhanced hover effects: color change to blue, ring effect
  - Use Tailwind CSS 4.1 classes: `hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400`
  - Add ring effect: `ring-2 ring-transparent hover:ring-blue-200 dark:hover:ring-blue-800`
  - Add smooth transitions: `transition-all duration-200`
  - Use Chrome DevTools MCP to verify contrast ratios meet 3:1 minimum
  - Test hover states in both light and dark modes
  - _Requirements: 21.4_
  - _Tools: serena, chrome-devtools_

- [x] 25.3 Add tooltips to sidebar buttons with shadcn/ui Tooltip
  - Use shadcn MCP to search for and install Tooltip component if not already installed
  - Use Serena MCP to find hamburger menu button in Header.tsx
  - Wrap hamburger menu button with TooltipProvider, Tooltip, TooltipTrigger
  - Add TooltipContent with descriptive text (e.g., "Open sidebar" / "Close sidebar")
  - Configure tooltip position: `side="bottom" align="start"`
  - Use Chrome DevTools MCP to verify tooltip contrast meets WCAG AAA (7:1)
  - Test tooltip appears on hover and focus
  - Test with keyboard navigation (Tab to button, tooltip should appear)
  - _Requirements: 21.3_
  - _Tools: shadcn, serena, chrome-devtools_

- [x] 25.4 Create FloatingActionButton component with shadcn/ui
  - Use Sequential Thinking MCP to plan floating button architecture
  - Create new component: `apps/frontend/src/components/ui/floating-action-button.tsx`
  - Use shadcn/ui Button component as base
  - Wrap with framer-motion for entrance/exit animations
  - Add TooltipProvider and Tooltip for accessibility
  - Implement props: onClick, label, icon, visible
  - Style with: `fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full`
  - Use blue colors: `bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600`
  - Add shadow: `shadow-lg hover:shadow-xl`
  - Add ring effect: `ring-2 ring-blue-200 dark:ring-blue-800`
  - Use chat bubbles icon (SVG) for clarity
  - Add spring animation: `initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}`
  - Add proper ARIA label: `aria-label={label}`
  - Test button size meets 44x44px minimum (actual size is 56x56px)
  - _Requirements: 21.2, 21.7, 21.8, 21.9, 21.10_
  - _Tools: sequential-thinking_

- [x] 25.5 Integrate FloatingActionButton into AppLayout
  - Use Serena MCP to analyze AppLayout.tsx structure
  - Import FloatingActionButton component
  - Add state logic: `showFloatingButton = (isMobile || isTablet) && !sidebarOpen`
  - Add click handler: `handleFloatingButtonClick = () => setSidebarOpen(true)`
  - Render FloatingActionButton in main content area with AnimatePresence
  - Position inside `<main>` element with `relative` positioning
  - Pass appropriate props: onClick, label (from i18n), icon, visible
  - Test button appears only when Sidebar is closed on mobile/tablet
  - Test button disappears when Sidebar opens
  - Test button is not visible on desktop
  - Use Chrome DevTools MCP to verify positioning and z-index
  - _Requirements: 21.2, 21.7_
  - _Tools: serena, chrome-devtools_

- [x] 25.6 Create OnboardingMessage component
  - Use Sequential Thinking MCP to plan onboarding UX flow
  - Create new component: `apps/frontend/src/components/ui/onboarding-message.tsx`
  - Implement modal overlay with backdrop: `fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]`
  - Create card: `bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm`
  - Add icon (info icon SVG) with blue color
  - Add title, description, and dismiss button
  - Use shadcn/ui Button for dismiss action
  - Wrap with framer-motion for scale and fade animations
  - Add click outside to dismiss functionality
  - Implement props: visible, onDismiss, title, description, dismissLabel
  - Add proper ARIA attributes: `role="dialog" aria-modal="true"`
  - Test animations respect prefers-reduced-motion
  - _Requirements: 21.5_
  - _Tools: sequential-thinking_

- [x] 25.7 Integrate onboarding logic into AppLayout
  - Use Serena MCP to analyze AppLayout.tsx state management
  - Add state: `showOnboarding`, `hasShownOnboarding`
  - Add useEffect to detect first-time Sidebar close on mobile/tablet
  - Check localStorage for `sidebar-onboarding-seen` flag
  - Show onboarding after 1 second delay when conditions met
  - Implement dismiss handler that sets localStorage flag
  - Render OnboardingMessage with AnimatePresence
  - Pass i18n strings for title, description, dismiss label
  - Test onboarding appears only on first Sidebar close
  - Test onboarding doesn't appear after dismissal
  - Test localStorage persistence across sessions
  - _Requirements: 21.5, 21.6_
  - _Tools: serena_

- [x] 25.8 Add i18n translations for new UI elements
  - Add translation keys for floating button label
  - Add translation keys for onboarding title, description, dismiss button
  - Add translations for both English and Chinese
  - Test language switching updates all new UI text
  - _Requirements: 21.3, 21.5_

- [ ] 25.9 Write property-based tests for Sidebar UX improvements
  - **Property 41: Desktop Sidebar Default Open State**
  - **Property 42: Floating Button Visibility**
  - **Property 43: Button Tooltip Presence**
  - **Property 44: Enhanced Button Visual Prominence**
  - **Property 45: First-Time Onboarding Display**
  - **Property 46: Onboarding Persistence**
  - **Property 47: Floating Button Sidebar Opening**
  - **Property 48: Floating Button Icon Clarity**
  - **Property 49: Sidebar Button Keyboard Accessibility**
  - **Property 50: Sidebar Button Screen Reader Support**
  - **Validates: Requirements 21.1-21.10**

- [ ] 25.10 Write unit tests for new components
  - Test FloatingActionButton renders with correct props
  - Test FloatingActionButton click handler
  - Test FloatingActionButton visibility logic
  - Test OnboardingMessage renders with correct content
  - Test OnboardingMessage dismiss functionality
  - Test localStorage persistence for onboarding
  - Test tooltip appears on hover and focus
  - Ensure all tests pass with zero errors and warnings

- [ ] 25.11 Update E2E tests for Sidebar UX improvements
  - Use Playwright MCP to test floating button interaction
  - Test floating button opens Sidebar on mobile
  - Test onboarding message appears on first Sidebar close
  - Test onboarding message doesn't appear after dismissal
  - Test hamburger menu button with enhanced styling
  - Test tooltips appear on hover
  - Test keyboard navigation to all sidebar buttons
  - Test screen reader announcements with axe-core
  - Verify all tests pass on Chromium, Firefox, and WebKit
  - _Tools: playwright_

- [ ] 25.12 Comprehensive accessibility testing for Sidebar UX
  - Use Chrome DevTools MCP to verify contrast ratios for all new elements
  - Test hamburger menu button contrast (3:1 minimum for focus indicator)
  - Test floating button contrast (7:1 minimum for icon)
  - Test tooltip contrast (7:1 minimum for text)
  - Test onboarding message contrast (7:1 minimum for text)
  - Test touch target sizes (minimum 44x44px)
  - Test keyboard navigation to all interactive elements
  - Test with screen reader (VoiceOver or NVDA)
  - Verify ARIA labels are descriptive and accurate
  - Test with prefers-reduced-motion enabled
  - _Requirements: 21.3, 21.4, 21.8, 21.9, 21.10_
  - _Tools: chrome-devtools, playwright_

- [ ] 25.13 Test Sidebar UX across all viewports
  - Use Chrome DevTools MCP device emulation to test:
    - Desktop (1920x1080): Sidebar open by default, no floating button
    - Tablet (768x1024): Sidebar closed by default, floating button visible
    - Mobile (375x667): Sidebar closed by default, floating button visible
  - Test orientation changes (portrait/landscape)
  - Test Sidebar state persistence across viewport changes
  - Verify animations are smooth at all viewport sizes
  - Test with actual devices if available
  - _Requirements: 21.1, 21.2_
  - _Tools: chrome-devtools_

- [ ] 26. Checkpoint: Verify Phase 13 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 27. Final Verification and Completion
  - Comprehensive testing and sign-off
  - _Requirements: All_

- [ ] 27.1 Final comprehensive testing with shadcn/ui
  - Use Chrome DevTools MCP to test all new features
  - Test animations at different speeds and on different devices
  - Test scroll behavior with various content lengths
  - Test in-place dialogs from different trigger positions
  - Test Glass adaptation with different backgrounds
  - Verify mobile bottom search on actual devices
  - Test Sidebar UX improvements on all viewports
  - Test floating button and onboarding flow
  - _Tools: chrome-devtools, playwright_

- [ ] 27.2 Final automated testing
  - Run all quality checks one last time
  - Verify zero errors and zero warnings
  - Verify all 50 properties have passing tests (including new Sidebar UX properties)
  - Check test coverage meets requirements
  - Verify both light and dark modes pass all tests

- [ ] 27.3 Confirm completion
  - Review all commits
  - Verify all 21 requirements are met (including new Requirement 21)
  - Confirm advanced Liquid Glass features are complete
  - Confirm Sidebar UX improvements are complete
  - Confirm both light and dark modes meet WCAG AAA standards
  - Document any known limitations or future improvements
