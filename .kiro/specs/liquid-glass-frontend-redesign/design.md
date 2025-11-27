# Design Document

## Overview

This design document outlines the architecture and implementation strategy for migrating the frontend application to a modern "liquid glass" design style. The migration focuses on fixing critical layout issues, implementing consistent visual styling, maintaining WCAG AAA accessibility standards, and ensuring comprehensive test coverage with zero errors and warnings.

The design leverages Tailwind CSS for utility-first styling, React 19 for component architecture, and TypeScript 5.3+ for type safety. The liquid glass aesthetic is achieved through backdrop blur effects, semi-transparent backgrounds, subtle borders, and layered depth perception.

## Architecture

### Component Hierarchy

```
App (Root)
├── ErrorBoundary
├── SessionProvider
├── AppProvider
├── ThemeProvider
├── I18nProvider
├── NotificationProvider
└── AccessibilityProvider
    └── AppLayout
        ├── SkipLink (Accessibility)
        ├── Header (Glass)
        │   ├── MenuButton (Mobile/Tablet)
        │   ├── AppTitle
        │   ├── LanguageSelector
        │   ├── ThemeToggle
        │   └── SettingsButton
        ├── Sidebar (Glass)
        │   ├── NewConversationButton
        │   ├── ConversationSearch
        │   ├── ConversationList (Virtualized)
        │   │   └── ConversationItem[]
        │   │       ├── TitleDisplay/Input
        │   │       ├── MetadataDisplay
        │   │       └── DropdownMenu
        │   └── SidebarFooter
        ├── SidebarOverlay (Mobile)
        └── MainContent
            └── ChatInterface / WelcomeMessage
```

### Layout System

The layout uses a flexbox-based structure with the following key characteristics:

1. **Fixed Header**: Sticky positioned at top with z-index 30
2. **Flexible Sidebar**: Fixed position on mobile (z-index 40), static on desktop
3. **Scrollable Main Content**: Flex-1 with overflow-y-auto
4. **Responsive Breakpoints**:
   - Mobile: < 768px (overlay sidebar)
   - Tablet: 768px - 1024px (toggleable sidebar)
   - Desktop: > 1024px (persistent sidebar)

### Glass Effect Implementation

The Glass component provides three intensity levels:

- **Low**: `bg-white/10 dark:bg-black/10 backdrop-blur-md` (subtle transparency)
- **Medium**: `bg-white/40 dark:bg-black/40 backdrop-blur-xl` (balanced visibility)
- **High**: `bg-white/70 dark:bg-black/70 backdrop-blur-2xl` (strong frosted effect)

All Glass components include:
- Semi-transparent borders: `border-white/20 dark:border-white/10`
- Shadow effects: `shadow-lg`
- Rounded corners: `rounded-2xl`
- Smooth transitions: `transition-all duration-300`

## Components and Interfaces

### Glass Component

```typescript
type GlassIntensity = 'low' | 'medium' | 'high';

type GlassProps<T extends React.ElementType> = {
  as?: T;
  intensity?: GlassIntensity;
  border?: boolean;
  children?: React.ReactNode;
} & React.ComponentPropsWithoutRef<T>;

export const Glass: React.ForwardRefExoticComponent<GlassProps<React.ElementType>>;
export function cn(...inputs: ClassValue[]): string;
```

### AppLayout Component

```typescript
export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps): React.JSX.Element;

export interface LayoutContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function LayoutContainer(props: LayoutContainerProps): React.JSX.Element;

export interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
}

export function ResponsiveGrid(props: ResponsiveGridProps): React.JSX.Element;
```

### Header Component

```typescript
export interface HeaderProps {
  isMobile: boolean;
  isTablet: boolean;
}

export function Header(props: HeaderProps): React.JSX.Element;

export interface BreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
    active?: boolean;
  }>;
}

export function Breadcrumb(props: BreadcrumbProps): React.JSX.Element;

export interface HeaderActionProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function HeaderAction(props: HeaderActionProps): React.JSX.Element;
```

### Sidebar Component

```typescript
export interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}

export function Sidebar(props: SidebarProps): React.JSX.Element;
```

## Data Models

### Theme Configuration

```typescript
type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContext {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}
```

### Responsive State

```typescript
interface ResponsiveState {
  isMobile: boolean;      // < 768px
  isTablet: boolean;      // 768px - 1024px
  isDesktop: boolean;     // > 1024px
  windowWidth: number;
  windowHeight: number;
}
```

### UI State

```typescript
interface UIState {
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;
  notifications: Notification[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sidebar Width Consistency
*For any* Glass component used as a Sidebar, when the sidebar is open, the component SHALL have a width of 320px (20rem) and apply the correct glass effect styling based on its intensity prop.
**Validates: Requirements 1.2**

### Property 2: Content Non-Overlap
*For any* layout state, the main content area SHALL not overlap with Header or Sidebar components, verified by checking that bounding rectangles do not intersect and z-index values are properly ordered.
**Validates: Requirements 1.3**

### Property 3: Responsive Breakpoint Behavior
*For any* window width, the layout SHALL apply the correct responsive behavior: overlay sidebar for mobile (< 768px), toggleable sidebar for tablet (768px-1024px), and persistent sidebar for desktop (> 1024px).
**Validates: Requirements 1.4**

### Property 4: Main Content Expansion
*For any* sidebar state change from open to closed on desktop, the main content area SHALL expand to fill the available horizontal space.
**Validates: Requirements 1.5**

### Property 5: Glass Intensity Styling
*For any* Glass component with a specified intensity level (low/medium/high), the component SHALL apply the corresponding backdrop-blur and background opacity CSS classes.
**Validates: Requirements 2.1**

### Property 6: Glass Component Z-Index Ordering
*For any* set of stacked Glass components, the z-index values SHALL be properly ordered such that components rendered later in the DOM tree appear above earlier components when overlapping.
**Validates: Requirements 2.2**

### Property 7: Theme-Dependent Glass Styling
*For any* Glass component, when the theme changes between light and dark mode, the component SHALL update its opacity and border color classes to match the current theme.
**Validates: Requirements 2.3**

### Property 8: Interactive Element Hover States
*For any* Glass component containing interactive elements (buttons, links, inputs), hovering over the interactive element SHALL apply visual feedback through background color changes.
**Validates: Requirements 2.4**

### Property 9: Glass Border Color Consistency
*For any* Glass component with border enabled, the border SHALL use semi-transparent white with opacity 0.2 in light mode and 0.1 in dark mode.
**Validates: Requirements 2.5**

### Property 10: Mobile Scroll Lock
*For any* mobile viewport (< 768px), when the Sidebar is open, the main content area SHALL have overflow hidden to prevent scrolling.
**Validates: Requirements 3.4**

### Property 11: Orientation Change Adaptation
*For any* device orientation change, the layout SHALL re-evaluate responsive breakpoints and apply appropriate styling without breaking the visual structure.
**Validates: Requirements 3.5**

### Property 12: Text Contrast Ratio Compliance
*For any* text element in the interface, the contrast ratio between text color and background color SHALL meet or exceed 7:1 for normal text and 4.5:1 for large text (WCAG AAA).
**Validates: Requirements 4.1**

### Property 13: Keyboard Navigation Completeness
*For any* interactive element in the interface, the element SHALL be reachable via Tab key navigation and SHALL display a visible focus indicator with minimum 3:1 contrast ratio.
**Validates: Requirements 4.2, 4.4**

### Property 14: ARIA Attribute Completeness
*For any* component in the interface, the component SHALL have appropriate ARIA labels, roles, and live regions as required by its semantic purpose.
**Validates: Requirements 4.3**

### Property 15: Language Switch Completeness
*For any* UI text element with a translation key, when the language is switched, the element SHALL update to display the text in the new language without page reload.
**Validates: Requirements 5.2**

### Property 16: Locale-Specific Date Formatting
*For any* date or time value displayed in the interface, the formatting SHALL match the selected locale's conventions (date order, time format, separators).
**Validates: Requirements 5.3**

### Property 17: Text Direction Layout Adaptation
*For any* language with RTL text direction, the layout SHALL apply dir="rtl" attribute and mirror the horizontal layout appropriately.
**Validates: Requirements 5.4**

### Property 18: Large List Virtualization
*For any* conversation list or message list exceeding 50 items, the rendering SHALL use virtualization to render only visible items plus a buffer.
**Validates: Requirements 6.5**

### Property 19: Search Result Keyword Highlighting
*For any* search query, all matching results SHALL display with the search keywords highlighted using appropriate HTML markup and styling.
**Validates: Requirements 8.1**

### Property 20: Search Pagination Navigation
*For any* search result set exceeding the page size (20 items), pagination controls SHALL be displayed and allow navigation to previous/next pages.
**Validates: Requirements 8.2**

### Property 21: Search Result Navigation
*For any* search result item, clicking the item SHALL navigate to the corresponding conversation and close the search interface.
**Validates: Requirements 8.3**

### Property 22: Search Result ARIA Announcements
*For any* search result update, the change SHALL be announced to screen readers via ARIA live regions with appropriate politeness level.
**Validates: Requirements 8.4**

### Property 23: Search Keyboard Navigation
*For any* search result set, arrow keys SHALL move focus between results, Home/End SHALL jump to first/last result, and Enter SHALL select the focused result.
**Validates: Requirements 8.5**

### Property 24: ClassName Utility Consistency
*For any* component requiring className merging, the cn() utility SHALL be used to properly merge Tailwind classes with conflict resolution.
**Validates: Requirements 9.5**

## Error Handling

### Layout Error Recovery

1. **Sidebar State Errors**: If sidebar state becomes inconsistent, reset to closed state on mobile, open state on desktop
2. **Responsive Detection Errors**: If window dimensions cannot be determined, default to desktop layout
3. **Theme Resolution Errors**: If theme cannot be determined, default to light mode
4. **Glass Component Errors**: If intensity prop is invalid, default to 'medium' intensity

### Accessibility Error Handling

1. **Missing ARIA Labels**: Log warnings in development mode for components missing required ARIA attributes
2. **Contrast Ratio Failures**: Log warnings for text elements failing WCAG AAA contrast requirements
3. **Focus Management Errors**: Ensure focus is never lost; return to last valid focusable element on error

### i18n Error Handling

1. **Missing Translation Keys**: Display the key itself as fallback text and log warning
2. **Locale Detection Errors**: Default to English (en) if browser language cannot be detected
3. **Date Formatting Errors**: Fall back to ISO 8601 format if locale-specific formatting fails

## Development Tools and Best Practices

### MCP Tools for Development

**Chrome DevTools MCP**: Use for real-time debugging and verification
- `mcp_chrome_devtools_take_snapshot`: Capture accessibility tree snapshots to verify ARIA structure
- `mcp_chrome_devtools_click`: Test interactive elements and verify behavior
- `mcp_chrome_devtools_evaluate_script`: Inspect computed styles, measure contrast ratios, check z-index values
- `mcp_chrome_devtools_list_console_messages`: Monitor console for errors and warnings
- `mcp_chrome_devtools_take_screenshot`: Capture visual state for comparison

**Playwright MCP**: Use for automated browser testing
- `mcp_microsoft_playwright_mcp_browser_snapshot`: Verify layout structure and accessibility
- `mcp_microsoft_playwright_mcp_browser_click`: Test user interactions
- `mcp_microsoft_playwright_mcp_browser_navigate`: Test navigation flows
- `mcp_microsoft_playwright_mcp_browser_evaluate`: Measure performance metrics, check DOM state

**Serena MCP**: Use for code analysis and refactoring
- `mcp_serena_find_symbol`: Locate components and functions for modification
- `mcp_serena_get_symbols_overview`: Understand file structure before changes
- `mcp_serena_search_for_pattern`: Find all usages of patterns (e.g., Glass component, className utilities)
- `mcp_serena_replace_symbol_body`: Refactor component implementations
- `mcp_serena_find_referencing_symbols`: Identify all components using a specific utility or component

**Sequential Thinking MCP**: Use for complex problem-solving
- Before implementing complex changes, use `mcp_sequential_thinking_sequentialthinking` to:
  - Break down the problem into steps
  - Consider multiple approaches
  - Identify potential issues and edge cases
  - Plan the optimal solution
  - Verify the approach before coding

### Development Workflow

1. **Analyze**: Use Serena MCP to understand current code structure
2. **Think**: Use Sequential Thinking MCP to plan the optimal approach
3. **Implement**: Make code changes following the plan
4. **Verify**: Use Chrome DevTools MCP to inspect the result in browser
5. **Test**: Use Playwright MCP to run automated tests
6. **Iterate**: Refine based on findings

### Example Workflow for Layout Fix

```typescript
// 1. Analyze current implementation
mcp_serena_get_symbols_overview({ relative_path: "apps/frontend/src/components/layout/Sidebar.tsx" })

// 2. Think through the solution
mcp_sequential_thinking_sequentialthinking({
  thought: "Need to fix Sidebar width. Current issue: width not consistent. Options: 1) Use fixed w-80 class, 2) Use custom width. Considering responsive behavior and Glass component constraints...",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

// 3. Find all usages of Sidebar
mcp_serena_find_referencing_symbols({
  name_path: "Sidebar",
  relative_path: "apps/frontend/src/components/layout/Sidebar.tsx"
})

// 4. Implement the fix
// ... make code changes ...

// 5. Verify in browser
mcp_chrome_devtools_navigate({ url: "http://localhost:5173" })
mcp_chrome_devtools_take_snapshot({ verbose: true })
mcp_chrome_devtools_evaluate_script({
  function: "() => { const sidebar = document.querySelector('[data-testid=\"sidebar\"]'); return { width: sidebar?.offsetWidth, classes: sidebar?.className }; }"
})

// 6. Test with Playwright
mcp_microsoft_playwright_mcp_browser_navigate({ url: "http://localhost:5173" })
mcp_microsoft_playwright_mcp_browser_snapshot()
```

## Testing Strategy

### Unit Testing Approach

Unit tests will use Vitest with happy-dom environment and focus on:

1. **Component Rendering**: Verify components render without errors with various prop combinations
2. **Glass Component**: Test intensity levels, border toggling, className merging
3. **Responsive Hooks**: Test useEffect hooks for window resize handling
4. **Theme Context**: Test theme switching and resolved theme calculation
5. **i18n Context**: Test language switching and translation key resolution
6. **Accessibility Utilities**: Test ARIA attribute generation and focus management

### Property-Based Testing

Property-based tests will use fast-check library (JavaScript PBT framework) with minimum 100 iterations per property:

**PBT Library**: fast-check (https://github.com/dubzzz/fast-check)

**Configuration**: Each property test SHALL run with at least 100 iterations to ensure adequate coverage of the input space.

**Tagging Convention**: Each property-based test MUST include a comment tag in the format:
```typescript
// Feature: liquid-glass-frontend-redesign, Property N: [property description]
```

**Property Test Examples**:

```typescript
// Feature: liquid-glass-frontend-redesign, Property 5: Glass Intensity Styling
test('Glass component applies correct styling for any intensity level', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('low', 'medium', 'high'),
      (intensity) => {
        const { container } = render(<Glass intensity={intensity}>Content</Glass>);
        const element = container.firstChild as HTMLElement;
        
        const expectedClasses = {
          low: ['bg-white/10', 'backdrop-blur-md'],
          medium: ['bg-white/40', 'backdrop-blur-xl'],
          high: ['bg-white/70', 'backdrop-blur-2xl'],
        };
        
        return expectedClasses[intensity].every(cls => 
          element.className.includes(cls)
        );
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: liquid-glass-frontend-redesign, Property 12: Text Contrast Ratio Compliance
test('All text elements meet WCAG AAA contrast requirements', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('light', 'dark'),
      fc.string({ minLength: 1, maxLength: 100 }),
      (theme, textContent) => {
        const { container } = render(
          <ThemeProvider initialTheme={theme}>
            <div className="text-gray-900 dark:text-gray-100">{textContent}</div>
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

// Feature: liquid-glass-frontend-redesign, Property 15: Language Switch Completeness
test('All UI text updates when language is switched', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('en', 'zh'),
      fc.constantFrom('en', 'zh'),
      (initialLang, targetLang) => {
        const { container, rerender } = render(
          <I18nProvider initialLanguage={initialLang}>
            <Header isMobile={false} isTablet={false} />
          </I18nProvider>
        );
        
        const initialText = container.textContent;
        
        rerender(
          <I18nProvider initialLanguage={targetLang}>
            <Header isMobile={false} isTablet={false} />
          </I18nProvider>
        );
        
        const updatedText = container.textContent;
        
        // If languages are different, text should change
        return initialLang === targetLang || initialText !== updatedText;
      }
    ),
    { numRuns: 100 }
  );
});
```

### E2E Testing Approach

E2E tests will use Playwright and cover:

1. **Layout Rendering**: Verify Header, Sidebar, and main content render correctly
2. **Responsive Behavior**: Test layout at mobile, tablet, and desktop breakpoints
3. **Sidebar Interactions**: Test open/close, conversation selection, rename, delete
4. **Search Functionality**: Test search input, results display, pagination, keyboard navigation
5. **Theme Switching**: Test light/dark mode transitions
6. **Language Switching**: Test English/Chinese language switching
7. **Keyboard Navigation**: Test Tab navigation, arrow keys, Enter, Escape
8. **Screen Reader**: Test ARIA labels and live regions with axe-core

### Test Coverage Requirements

- **Overall Coverage**: Minimum 80% line coverage for all frontend modules
- **Critical Paths**: 100% coverage for layout components, Glass component, accessibility utilities
- **Property Tests**: All 24 correctness properties must have corresponding property-based tests
- **E2E Tests**: All critical user flows must pass on Chromium, Firefox, and WebKit

### Quality Gates

All tests must pass with:
- **Zero errors**: No test failures, no TypeScript errors, no ESLint errors
- **Zero warnings**: No test warnings, no TypeScript warnings, no ESLint warnings
- **No rule bypasses**: No eslint-disable comments, no @ts-ignore, no type assertions
- **Meaningful tests**: Tests must verify actual behavior, not implementation details

## Performance Considerations

### Rendering Optimization

1. **React.memo**: Wrap expensive components (ConversationList, MessageList) in React.memo
2. **Virtualization**: Use react-window for lists exceeding 50 items
3. **Code Splitting**: Lazy load non-critical components (PerformanceDashboard, ModelDemo)
4. **Debouncing**: Debounce search input and window resize handlers (300ms)

### Memory Management

1. **Cleanup**: Ensure all useEffect hooks return cleanup functions
2. **Event Listeners**: Remove event listeners in cleanup functions
3. **Timers**: Clear all timers (setTimeout, setInterval) in cleanup functions
4. **Memory Monitoring**: Log warnings when memory usage exceeds 90%

### CSS Optimization

1. **Tailwind Purging**: Configure Tailwind to purge unused classes in production
2. **Critical CSS**: Inline critical CSS for above-the-fold content
3. **Backdrop Filter**: Provide fallbacks for browsers without backdrop-filter support
4. **Transitions**: Use GPU-accelerated properties (transform, opacity) for animations

## Browser Compatibility

### Supported Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

### Fallback Strategies

1. **Backdrop Filter**: Use solid backgrounds with reduced opacity if backdrop-filter unsupported
2. **CSS Grid**: Provide flexbox fallback for older browsers
3. **CSS Variables**: Provide static color values as fallback
4. **Intersection Observer**: Provide scroll-based fallback for virtualization

### Feature Detection

```typescript
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)') ||
                                CSS.supports('-webkit-backdrop-filter', 'blur(10px)');

const supportsContainerQueries = CSS.supports('container-type', 'inline-size');

const supportsHasSelector = CSS.supports('selector(:has(*))');
```

## Deployment Considerations

### Build Configuration

1. **Production Build**: Use Vite production mode with minification
2. **Source Maps**: Generate source maps for debugging but exclude from production bundle
3. **Asset Optimization**: Compress images, inline small SVGs, lazy load large assets
4. **Environment Variables**: Validate all required environment variables at build time

### CDN Strategy

1. **Static Assets**: Serve CSS, JS, images from CDN with long cache headers
2. **Cache Busting**: Use content hashes in filenames for cache invalidation
3. **Preloading**: Preload critical fonts and CSS
4. **Compression**: Enable gzip/brotli compression for text assets

### Monitoring

1. **Error Tracking**: Log all errors to monitoring service with context
2. **Performance Metrics**: Track Core Web Vitals (LCP, FID, CLS)
3. **User Analytics**: Track feature usage, language preferences, theme preferences
4. **Accessibility Metrics**: Monitor keyboard navigation usage, screen reader usage

## Functional Preservation Requirements

### Critical: All Existing Functionality Must Be Preserved

The migration to Tailwind CSS and liquid glass design is a **visual and structural refactoring only**. All existing functionality must continue to work correctly:

1. **Conversation Management**: Create, read, update, delete conversations
2. **Message Handling**: Send messages, receive streaming responses, display message history
3. **Search Functionality**: Search conversations, display results, navigate to conversations
4. **Session Management**: Maintain session state, persist across page reloads
5. **Storage Operations**: IndexedDB operations, localStorage fallbacks, data integrity checks
6. **Theme Switching**: Light/dark mode toggle with persistence
7. **Language Switching**: English/Chinese toggle with persistence
8. **Model Selection**: Switch between AI models, persist preferences
9. **File Upload**: Upload files, preview files, include in messages
10. **Context Management**: Track context usage, show warnings, handle compression
11. **Error Handling**: Display errors, retry failed operations, recover gracefully
12. **Accessibility Features**: Keyboard navigation, screen reader support, focus management
13. **Performance Monitoring**: Track metrics, display dashboard (dev mode)
14. **Cross-Tab Sync**: Synchronize state across browser tabs
15. **Notifications**: Display success/error/info notifications

### Verification Strategy

After each phase of migration:

1. **Manual Testing**: Test all critical user flows in the browser
2. **Unit Tests**: Ensure all existing unit tests still pass
3. **E2E Tests**: Ensure all existing E2E tests still pass
4. **Regression Testing**: Compare behavior before and after changes
5. **Storage Testing**: Verify data persistence and retrieval
6. **Integration Testing**: Verify API communication still works

### Bug Fixing During Migration

The migration process may reveal existing bugs in the codebase. When bugs are discovered:

**Allowed Bug Fixes**:
1. **Layout Bugs**: Incorrect positioning, overlapping elements, broken responsive behavior
2. **Styling Bugs**: Inconsistent colors, missing hover states, broken transitions
3. **Accessibility Bugs**: Missing ARIA labels, incorrect focus order, insufficient contrast
4. **Functional Bugs**: Broken event handlers, incorrect state updates, memory leaks
5. **Performance Bugs**: Unnecessary re-renders, missing memoization, inefficient algorithms
6. **Type Safety Bugs**: Incorrect types, missing null checks, unsafe type assertions

**Bug Fix Process**:
1. **Document**: Record the bug with reproduction steps and expected behavior
2. **Analyze**: Determine root cause and impact on other components
3. **Fix**: Implement the fix following best practices
4. **Test**: Add or update tests to prevent regression
5. **Verify**: Ensure the fix doesn't break other functionality
6. **Commit**: Create a separate commit with clear description of the bug and fix

**Bug Fix Commit Format**:
```
fix(component): brief description of bug fix

- Describe the bug that was found
- Explain the root cause
- Describe the solution implemented
- Reference any related issues or requirements

Fixes: [bug description]
```

### Rollback Plan

If any functionality breaks during migration:

1. **Identify**: Determine which change caused the regression
2. **Isolate**: Revert the specific change while keeping other improvements
3. **Fix**: Correct the issue while preserving the visual improvements
4. **Verify**: Re-test to ensure functionality is restored
5. **Document**: Record the issue and solution for future reference

## Migration Strategy

### Phase 1: Fix Critical Layout Issues (P0)

1. Fix Header positioning and alignment
2. Fix Sidebar width and glass effect styling
3. Fix main content area overlap issues
4. Fix responsive breakpoint behavior
5. Verify all layout tests pass

### Phase 2: Implement Consistent Glass Styling (P0)

1. Audit all Glass component usage
2. Standardize intensity levels across components
3. Fix border and shadow inconsistencies
4. Verify theme switching works correctly
5. Update Glass component tests

### Phase 3: Ensure Accessibility Compliance (P0)

1. Audit color contrast ratios with automated tools
2. Fix focus indicators to meet 3:1 contrast requirement
3. Add missing ARIA labels and roles
4. Test keyboard navigation completeness
5. Test with screen readers (NVDA, JAWS, VoiceOver)

### Phase 4: Fix Search Functionality (P1)

1. Fix search result highlighting
2. Implement pagination controls
3. Fix keyboard navigation in search results
4. Add ARIA live regions for result updates
5. Update search E2E tests

### Phase 5: Optimize Performance (P2)

1. Add React.memo to expensive components
2. Implement virtualization for large lists
3. Add debouncing to search and resize handlers
4. Optimize bundle size with code splitting
5. Verify performance metrics meet targets

### Phase 6: Code Cleanup and Quality (P3)

1. Remove commented-out code and debug statements
2. Consolidate duplicate utilities
3. Update documentation and comments
4. Run all quality checks (lint, type-check, test)
5. Verify zero errors and zero warnings

### Phase 7: Commit and Deploy

1. Review all changes and group logically
2. Create conventional commits (feat/fix/refactor/docs/test)
3. Write clear commit messages
4. Push to feature branch
5. Create pull request with comprehensive description

## Success Criteria

The migration is considered successful when:

1. ✅ All layout issues are resolved and UI displays correctly
2. ✅ All Glass components have consistent styling and theming
3. ✅ All accessibility requirements meet WCAG AAA standards
4. ✅ All search functionality works with pagination and keyboard navigation
5. ✅ All unit tests pass with >80% coverage
6. ✅ All E2E tests pass on Chromium, Firefox, and WebKit
7. ✅ TypeScript type-check reports zero errors
8. ✅ ESLint reports zero errors and zero warnings
9. ✅ All 24 correctness properties have passing property-based tests
10. ✅ Code is clean with no commented-out code or debug statements
11. ✅ Commit history follows conventional commit format
12. ✅ i18n support works for English and Chinese
