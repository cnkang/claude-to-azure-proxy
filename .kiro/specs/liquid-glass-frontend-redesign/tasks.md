# Implementation Plan

## Overview

This implementation plan breaks down the liquid glass frontend redesign into discrete, manageable tasks. Each task builds incrementally on previous work, with checkpoints to ensure all tests pass before proceeding.

## Development Tools and Best Practices

### MCP Tools Usage

**Always use these tools to enhance development quality:**

1. **Sequential Thinking MCP** (`mcp_sequential_thinking_sequentialthinking`)
   - Use BEFORE implementing complex changes
   - Break down problems into steps
   - Consider multiple approaches
   - Identify edge cases and potential issues
   - Plan the optimal solution

2. **Serena MCP** (Code Analysis)
   - `mcp_serena_get_symbols_overview`: Understand file structure
   - `mcp_serena_find_symbol`: Locate components and functions
   - `mcp_serena_search_for_pattern`: Find all usages of patterns
   - `mcp_serena_find_referencing_symbols`: Identify dependencies
   - `mcp_serena_replace_symbol_body`: Refactor implementations

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

2. THINK (Sequential Thinking MCP)
   → Break down the problem
   → Consider multiple approaches
   → Plan the optimal solution

3. IMPLEMENT
   → Make code changes following the plan
   → Use Serena MCP for refactoring

4. VERIFY (Chrome DevTools MCP)
   → Inspect the result in browser
   → Measure dimensions, contrast, z-index
   → Check console for errors

5. TEST (Playwright MCP)
   → Run automated tests
   → Verify behavior across browsers

6. ITERATE
   → Refine based on findings
   → Use Sequential Thinking for complex issues
```

## Task List

- [-] 1. Phase 1: Fix Critical Layout Issues (P0)
  - Fix Header, Sidebar, and main content positioning and alignment
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 1.1 Audit and fix Header component layout
  - Use Serena MCP to analyze Header.tsx structure and dependencies
  - Use Sequential Thinking MCP to plan the optimal fix approach
  - Review Header.tsx for positioning and alignment issues
  - Ensure sticky positioning works correctly (top-0, z-30)
  - Fix Glass component intensity and styling
  - Use Chrome DevTools MCP to verify positioning and z-index in browser
  - Use Playwright MCP to test responsive behavior on mobile, tablet, and desktop
  - _Requirements: 1.1, 2.1, 2.3_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 1.2 Audit and fix Sidebar component layout
  - Use Serena MCP to analyze Sidebar.tsx and find all Glass component usages
  - Use Sequential Thinking MCP to plan width and positioning fixes
  - Review Sidebar.tsx for width and positioning issues
  - Ensure Sidebar width is exactly 320px (w-80) when open
  - Fix Glass component intensity (should be 'high')
  - Use Chrome DevTools MCP to measure actual width and verify glass effects
  - Verify fixed positioning on mobile (z-40) and static on desktop
  - Use Playwright MCP to test overlay backdrop on mobile
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 1.3 Fix main content area positioning and overlap
  - Use Serena MCP to analyze AppLayout.tsx component structure
  - Use Sequential Thinking MCP to plan layout fix strategy
  - Review AppLayout.tsx for content area positioning
  - Ensure main content doesn't overlap with Header or Sidebar
  - Use Chrome DevTools MCP to inspect bounding boxes and z-index values
  - Verify z-index values are properly ordered (Header: 30, Sidebar: 40, Main: 10)
  - Use Playwright MCP to test content expansion when Sidebar closes on desktop
  - _Requirements: 1.3, 1.5_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 1.4 Fix responsive breakpoint behavior
  - Review useEffect hooks for window resize handling
  - Ensure breakpoints are correctly defined
  - Fix auto-close Sidebar on mobile when screen size changes
  - Test orientation changes
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.5 Standardize Glass component usage
  - Audit all components using Glass component
  - Ensure consistent intensity levels
  - Verify border prop is used consistently
  - Test theme switching for all Glass components
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 1.6 Write property-based test for Glass styling
  - **Property 5: Glass Intensity Styling**
  - **Validates: Requirements 2.1**

- [x] 1.7 Write property-based test for theme-dependent styling
  - **Property 7: Theme-Dependent Glass Styling**
  - **Validates: Requirements 2.3**

- [x] 1.8 Update unit tests for layout components
  - Update Header, Sidebar, AppLayout tests
  - Ensure all tests pass with zero errors and warnings

- [x] 1.9 Update E2E tests for layout rendering
  - Update tests for Header, Sidebar, main content
  - Test responsive behavior at all breakpoints

- [x] 2. Checkpoint: Verify Phase 1 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 2: Ensure Accessibility Compliance (P0)
  - Audit and fix color contrast ratios
  - Fix focus indicators
  - Add missing ARIA labels
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3.1 Audit color contrast ratios
  - Use Chrome DevTools MCP to evaluate computed styles and measure contrast ratios
  - Use Playwright MCP with axe-core to run automated accessibility audit
  - Use Sequential Thinking MCP to analyze contrast failures and plan fixes
  - Identify all contrast failures (need 7:1 for normal text, 4.5:1 for large)
  - Document required adjustments with current and target ratios
  - _Requirements: 4.1_
  - _Tools: chrome-devtools, playwright, sequential-thinking_

- [x] 3.2 Fix text color contrast issues
  - Use Serena MCP to find all text color usages across components
  - Use Sequential Thinking MCP to plan color adjustments that maintain design aesthetic
  - Update text colors to meet WCAG AAA (7:1 for normal, 4.5:1 for large)
  - Use Chrome DevTools MCP to verify contrast ratios after changes
  - Test in both light and dark modes with DevTools theme emulation
  - _Requirements: 4.1_
  - _Tools: serena, sequential-thinking, chrome-devtools_

- [x] 3.3 Fix focus indicator contrast
  - Ensure focus indicators have 3:1 contrast
  - Update focus styles
  - Test in high contrast mode
  - _Requirements: 4.2, 4.4_

- [x] 3.4 Add missing ARIA labels and roles
  - Add aria-label to icon-only buttons
  - Add role attributes
  - Add aria-live regions
  - _Requirements: 4.3_

- [x] 3.5 Implement keyboard navigation
  - Test Tab navigation
  - Implement arrow key navigation for lists
  - Add Home/End key support
  - _Requirements: 4.2_

- [x] 3.6 Test with screen readers
  - Test with NVDA or VoiceOver
  - Verify announcements
  - Fix any issues found
  - _Requirements: 4.3_

- [x] 3.7 Write property-based test for contrast
  - **Property 12: Text Contrast Ratio Compliance**
  - **Validates: Requirements 4.1**

- [x] 3.8 Write property-based test for keyboard navigation
  - **Property 13: Keyboard Navigation Completeness**
  - **Validates: Requirements 4.2, 4.4**

- [x] 3.9 Update E2E tests for accessibility
  - Add axe-core checks
  - Test keyboard navigation flows

- [x] 4. Checkpoint: Verify Phase 2 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 3: Fix Search Functionality (P1)
  - Fix search result highlighting
  - Implement pagination
  - Fix keyboard navigation
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 5.1 Fix search result keyword highlighting
  - Use Serena MCP to analyze ConversationSearch.tsx and SearchResultItem.tsx
  - Use Sequential Thinking MCP to design highlighting algorithm
  - Implement keyword highlighting with HTML markup (<mark> or <span>)
  - Style highlighted keywords (WCAG AAA compliant colors)
  - Use Chrome DevTools MCP to verify highlighting and contrast ratios
  - Use Playwright MCP to test with various search queries
  - _Requirements: 8.1_
  - _Tools: serena, sequential-thinking, chrome-devtools, playwright_

- [x] 5.2 Implement search pagination
  - Implement Previous/Next buttons
  - Add page number display
  - Add ARIA labels
  - _Requirements: 8.2_

- [x] 5.3 Fix keyboard navigation in search
  - Implement arrow key navigation
  - Implement Home/End keys
  - Implement Enter/Escape keys
  - _Requirements: 8.5_

- [x] 5.4 Add ARIA live regions for search
  - Add aria-live to results container
  - Announce result count changes
  - _Requirements: 8.4_

- [x] 5.5 Fix search result navigation
  - Ensure clicking navigates correctly
  - Close search after navigation
  - _Requirements: 8.3_

- [x] 5.6 Write property-based tests for search
  - **Property 19-23: Search functionality**
  - **Validates: Requirements 8.1-8.5**

- [x] 5.7 Update E2E tests for search
  - Test search input and results
  - Test pagination and keyboard navigation

- [x] 6. Checkpoint: Verify Phase 3 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 4: Ensure i18n Support (P1)
  - Test language switching
  - Add missing translations
  - Verify date formatting
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7.1 Verify language detection
  - Test browser language detection
  - Test language persistence
  - _Requirements: 5.1_

- [x] 7.2 Test language switching
  - Test English/Chinese switching
  - Verify immediate updates
  - _Requirements: 5.2_

- [x] 7.3 Add missing translation keys
  - Audit for hardcoded text
  - Add translations for English and Chinese
  - _Requirements: 5.5_

- [x] 7.4 Verify date formatting
  - Test date/time formatting for locales
  - Test relative time formatting
  - _Requirements: 5.3_

- [x] 7.5 Write property-based tests for i18n
  - **Property 15-17: i18n functionality**
  - **Validates: Requirements 5.2-5.4**

- [x] 8. Checkpoint: Verify Phase 4 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Phase 5: Optimize Performance (P2)
  - Add React.memo
  - Implement virtualization
  - Add debouncing
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9.1 Add React.memo to expensive components
  - Wrap ConversationList, MessageList
  - Verify re-render count decreases
  - _Requirements: 6.5_

- [x] 9.2 Implement virtualization
  - Ensure react-window for lists > 50 items
  - Test scrolling performance
  - _Requirements: 6.2, 6.5_

- [x] 9.3 Add debouncing
  - Add debounce to search input
  - Add debounce to resize handler
  - _Requirements: 6.3_

- [x] 9.4 Optimize bundle size
  - Use React.lazy for non-critical components
  - Verify bundle size reduction
  - _Requirements: 6.1_

- [x] 9.5 Write property-based test for virtualization
  - **Property 18: Large List Virtualization**
  - **Validates: Requirements 6.5**

- [x] 10. Checkpoint: Verify Phase 5 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase 6: Write Remaining PBT (P2)
  - Write all remaining property-based tests
  - _Requirements: 7.1-7.5_

- [x] 11.1 Write PBT for layout properties
  - **Property 1-4: Layout consistency**
  - **Validates: Requirements 1.2-1.5**

- [x] 11.2 Write PBT for Glass properties
  - **Property 6, 8-11: Glass styling**
  - **Validates: Requirements 2.2-3.5**

- [x] 11.3 Write PBT for utility functions
  - **Property 24: ClassName utility**
  - **Validates: Requirements 9.5**

- [x] 12. Checkpoint: Verify Phase 6 completion
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Phase 7: Code Cleanup (P3)
  - Remove commented code
  - Consolidate utilities
  - Run quality checks
  - _Requirements: 7.1-7.5, 11.1-11.5_

- [x] 13.1 Remove commented code and debug statements
  - Use Serena MCP to search for commented code patterns
  - Use Serena MCP to find all console.log and debugger statements
  - Review and remove or document intentional commented code
  - Remove console.log statements (except in logger utility)
  - Remove debugger statements
  - _Requirements: 11.5_
  - _Tools: serena_

- [x] 13.2 Consolidate duplicate utilities
  - Use Serena MCP to search for duplicate utility functions
  - Use Sequential Thinking MCP to plan consolidation strategy
  - Consolidate into shared utilities in utils directory
  - Use Serena MCP to update imports across all components
  - Test that functionality still works
  - _Requirements: 11.1_
  - _Tools: serena, sequential-thinking_

- [x] 13.3 Update documentation
  - Update JSDoc comments
  - Update README if needed
  - _Requirements: 11.4_

- [x] 13.4 Run TypeScript type-check
  - Run `pnpm type-check`
  - Fix errors without suppressions
  - _Requirements: 7.3_

- [x] 13.5 Run ESLint
  - Run `pnpm lint`
  - Fix all errors and warnings
  - _Requirements: 7.4_

- [x] 13.6 Run all unit tests
  - Run `pnpm test --run`
  - Verify 80% coverage
  - _Requirements: 7.1, 7.5_

- [x] 13.7 Run all E2E tests
  - Run `pnpm test:e2e`
  - Test on all browsers
  - _Requirements: 7.2_

- [x] 14. Checkpoint: Verify Phase 7 completion
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Phase 8: Commit Changes (P3)
  - Create conventional commits
  - _Requirements: 11.2-11.4_

- [x] 15.1 Commit layout fixes
  - `fix(layout): fix critical layout issues`
  - _Requirements: 11.2, 11.3_

- [x] 15.2 Commit Glass improvements
  - `feat(ui): standardize Glass component`
  - _Requirements: 11.2, 11.3_

- [x] 15.3 Commit accessibility improvements
  - `feat(a11y): implement WCAG AAA compliance`
  - _Requirements: 11.2, 11.3_

- [x] 15.4 Commit search fixes
  - `fix(search): implement highlighting and pagination`
  - _Requirements: 11.2, 11.3_

- [x] 15.5 Commit i18n improvements
  - `feat(i18n): enhance language switching`
  - _Requirements: 11.2, 11.3_

- [x] 15.6 Commit performance optimizations
  - `perf: optimize rendering`
  - _Requirements: 11.2, 11.3_

- [x] 15.7 Commit test additions
  - `test: add comprehensive PBT and E2E tests`
  - _Requirements: 11.2, 11.3_

- [x] 15.8 Commit code cleanup
  - `chore: remove commented code and update docs`
  - _Requirements: 11.2, 11.3_

- [ ] 16. Final Verification
  - Manual and automated testing
  - _Requirements: All_

- [ ] 16.1 Final manual testing
  - Use Chrome DevTools MCP to navigate and test all flows
  - Use DevTools device emulation to test mobile, tablet, desktop
  - Use DevTools theme emulation to test light/dark modes
  - Test language switching (English/Chinese)
  - Use Chrome DevTools MCP to capture screenshots for documentation
  - Use Playwright MCP to run final E2E test suite
  - _Tools: chrome-devtools, playwright_

- [ ] 16.2 Final automated testing
  - Run all quality checks
  - Verify zero errors and warnings

- [ ] 16.3 Confirm completion
  - Review commit history
  - Verify all requirements met
  - Confirm migration complete
