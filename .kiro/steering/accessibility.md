# Accessibility Guidelines (WCAG 2.2 AAA)

## Overview

All user interface components in the Claude-to-Azure OpenAI Proxy application MUST comply with Web Content Accessibility Guidelines (WCAG) 2.2 Level AAA standards. This ensures the application is accessible to all users, including those with disabilities.

## Mandatory Requirements

### 1. Perceivable

**1.1 Text Alternatives**
- Provide text alternatives for all non-text content
- Use descriptive alt text for images
- Provide captions and transcripts for audio/video content

**1.2 Color Contrast**
- Normal text: Minimum 7:1 contrast ratio (AAA)
- Large text (18pt+ or 14pt+ bold): Minimum 4.5:1 contrast ratio
- UI components and graphical objects: Minimum 3:1 contrast ratio
- Focus indicators: Minimum 3:1 contrast ratio

**1.3 Color Independence**
- Never use color as the only means of conveying information
- Combine color with text, icons, or patterns
- Example: Highlighted search results use both yellow background AND bold text

**1.4 Responsive Design**
- Support text resize up to 200% without loss of functionality
- Support zoom up to 400% without horizontal scrolling
- Reflow content for different viewport sizes
- Support portrait and landscape orientations

**1.5 Visual Presentation**
- Line height at least 1.5 times font size
- Paragraph spacing at least 2 times font size
- Letter spacing at least 0.12 times font size
- Word spacing at least 0.16 times font size
- Maximum line length of 80 characters

### 2. Operable

**2.1 Keyboard Accessibility**
- All functionality available via keyboard
- No keyboard traps
- Visible focus indicators on all interactive elements
- Logical tab order
- Keyboard shortcuts documented and customizable

**2.2 Navigation**
- Skip links to main content and navigation
- Multiple ways to find content (search, sitemap, navigation)
- Clear page titles and headings
- Breadcrumb navigation where appropriate
- Consistent navigation across pages

**2.3 Timing**
- No time limits on user interactions
- If time limits exist, provide warnings and extensions
- Allow users to pause, stop, or hide moving content
- No auto-playing audio or video

**2.4 Focus Management**
- Focus moves logically through the page
- Focus returns to triggering element after modal closes
- Focus visible at all times
- No focus traps

**2.5 Input Modalities**
- Support mouse, keyboard, touch, and voice input
- Touch targets at least 44x44 CSS pixels
- Sufficient spacing between interactive elements
- Support for pointer cancellation

### 3. Understandable

**3.1 Readable**
- Use clear, simple language
- Define unusual words and abbreviations
- Provide pronunciation guides for ambiguous words
- Reading level appropriate for audience (lower secondary education level)

**3.2 Predictable**
- Consistent navigation and layout
- Consistent identification of components
- No unexpected context changes
- Warn users before opening new windows or tabs

**3.3 Input Assistance**
- Clear labels and instructions for all form fields
- Error identification and suggestions
- Error prevention for legal, financial, or data transactions
- Confirmation for irreversible actions (e.g., delete conversation)

**3.4 Error Handling**
- Identify errors clearly
- Provide specific error messages
- Suggest corrections
- Allow users to review and correct before submission

### 4. Robust

**4.1 Semantic HTML**
- Use semantic HTML5 elements (header, nav, main, article, aside, footer)
- Proper heading hierarchy (h1 → h2 → h3)
- Use lists for list content
- Use tables for tabular data with proper headers

**4.2 ARIA Attributes**
- Use ARIA labels and descriptions
- Use ARIA roles appropriately
- Use ARIA live regions for dynamic content
- Use ARIA states and properties correctly

**4.3 Compatibility**
- Valid HTML and CSS
- Compatible with assistive technologies
- Progressive enhancement
- Graceful degradation

## Implementation Guidelines

### Color Schemes

```typescript
// Light mode (WCAG AAA compliant)
const lightMode = {
  background: '#FFFFFF',
  text: '#000000', // 21:1 contrast
  textSecondary: '#333333', // 12.6:1 contrast
  primary: '#0066CC', // 7.5:1 contrast
  primaryHover: '#0052A3', // 9:1 contrast
  error: '#CC0000', // 7.5:1 contrast
  success: '#008000', // 7:1 contrast
  warning: '#996600', // 7:1 contrast
  border: '#CCCCCC', // 3:1 contrast
  focus: '#0066CC', // 7.5:1 contrast
};

// Dark mode (WCAG AAA compliant)
const darkMode = {
  background: '#000000',
  text: '#FFFFFF', // 21:1 contrast
  textSecondary: '#CCCCCC', // 12.6:1 contrast
  primary: '#66B3FF', // 7.5:1 contrast
  primaryHover: '#99CCFF', // 9:1 contrast
  error: '#FF6666', // 7.5:1 contrast
  success: '#66FF66', // 7:1 contrast
  warning: '#FFCC66', // 7:1 contrast
  border: '#333333', // 3:1 contrast
  focus: '#66B3FF', // 7.5:1 contrast
};

// High contrast mode
const highContrastMode = {
  background: '#000000',
  text: '#FFFFFF',
  primary: '#FFFFFF',
  primaryHover: '#FFFF00',
  error: '#FF0000',
  success: '#00FF00',
  warning: '#FFFF00',
  border: '#FFFFFF',
  focus: '#FFFFFF',
};
```

### Focus Indicators

```css
/* Visible focus indicator (WCAG AAA) */
*:focus {
  outline: 3px solid var(--focus-color);
  outline-offset: 2px;
}

/* High contrast focus indicator */
@media (prefers-contrast: high) {
  *:focus {
    outline-width: 4px;
    outline-color: #FFFFFF;
  }
}

/* Focus visible (keyboard only) */
*:focus-visible {
  outline: 3px solid var(--focus-color);
  outline-offset: 2px;
}

/* Remove focus for mouse users */
*:focus:not(:focus-visible) {
  outline: none;
}
```

### ARIA Patterns

```typescript
// Search component
<div role="search">
  <label htmlFor="search-input">Search conversations</label>
  <input
    id="search-input"
    type="search"
    role="searchbox"
    aria-label="Search conversations"
    aria-describedby="search-instructions"
    aria-controls="search-results"
    aria-expanded={hasResults}
    aria-activedescendant={focusedResultId}
  />
  <div id="search-instructions" className="sr-only">
    Type to search through conversation titles and messages
  </div>
</div>

// Search results
<div
  id="search-results"
  role="region"
  aria-label="Search results"
  aria-live="polite"
  aria-atomic="false"
>
  {results.map((result, index) => (
    <article
      key={result.id}
      role="article"
      aria-labelledby={`result-title-${result.id}`}
      tabIndex={0}
      onKeyDown={(e) => handleResultKeyDown(e, index)}
    >
      <h3 id={`result-title-${result.id}`}>{result.title}</h3>
      {/* Result content */}
    </article>
  ))}
</div>

// Pagination
<nav role="navigation" aria-label="Search results pagination">
  <button
    aria-label="Previous page"
    aria-disabled={!hasPreviousPage}
    disabled={!hasPreviousPage}
  >
    Previous
  </button>
  <span aria-current="page">Page {currentPage} of {totalPages}</span>
  <button
    aria-label="Next page"
    aria-disabled={!hasNextPage}
    disabled={!hasNextPage}
  >
    Next
  </button>
</nav>

// Loading indicator
<div role="status" aria-label="Searching conversations" aria-live="polite">
  <span className="sr-only">Searching...</span>
  <LoadingSpinner aria-hidden="true" />
</div>

// Error message
<div role="alert" aria-live="assertive">
  <p>Error: {errorMessage}</p>
  <button onClick={retry}>Retry</button>
</div>
```

### Keyboard Navigation

```typescript
// Keyboard shortcuts
const keyboardShortcuts = {
  // Global
  'Ctrl+K': 'Open search',
  'Escape': 'Close modal/Clear search',
  'Tab': 'Move to next element',
  'Shift+Tab': 'Move to previous element',
  
  // Search
  'ArrowDown': 'Move to next result',
  'ArrowUp': 'Move to previous result',
  'Enter': 'Open selected result',
  'Home': 'Jump to first result',
  'End': 'Jump to last result',
  
  // Pagination
  'PageDown': 'Next page',
  'PageUp': 'Previous page',
  
  // Conversation
  'Ctrl+N': 'New conversation',
  'Ctrl+D': 'Delete conversation',
  'Ctrl+R': 'Rename conversation',
};

// Implement keyboard handler
function handleKeyDown(e: KeyboardEvent) {
  const key = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;
  
  switch (key) {
    case 'Ctrl+K':
      e.preventDefault();
      openSearch();
      break;
    case 'Escape':
      e.preventDefault();
      closeModal();
      break;
    // ... other shortcuts
  }
}
```

### Screen Reader Support

```typescript
// Screen reader only text
<span className="sr-only">
  {/* Text visible only to screen readers */}
</span>

// CSS for sr-only
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

// Announce dynamic content
<div aria-live="polite" aria-atomic="true">
  {/* Content that changes dynamically */}
</div>

// Announce urgent messages
<div aria-live="assertive" role="alert">
  {/* Urgent messages */}
</div>
```

### Motion and Animation

```css
/* Respect user's motion preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Safe animations */
@media (prefers-reduced-motion: no-preference) {
  .fade-in {
    animation: fadeIn 0.3s ease-in;
  }
  
  .slide-in {
    animation: slideIn 0.3s ease-out;
  }
}
```

## Testing Requirements

### Automated Testing

```typescript
// Accessibility testing with vitest and jest-axe
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Search Component Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<ConversationSearch />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
  
  it('should have proper ARIA labels', () => {
    const { getByRole } = render(<ConversationSearch />);
    expect(getByRole('searchbox')).toHaveAttribute('aria-label', 'Search conversations');
  });
  
  it('should be keyboard navigable', () => {
    const { getByRole } = render(<ConversationSearch />);
    const searchInput = getByRole('searchbox');
    
    // Tab to search input
    userEvent.tab();
    expect(searchInput).toHaveFocus();
    
    // Type search query
    userEvent.type(searchInput, 'test');
    
    // Arrow down to results
    userEvent.keyboard('{ArrowDown}');
    expect(getByRole('article')).toHaveFocus();
  });
});
```

### Manual Testing Checklist

- [ ] Test with keyboard only (no mouse)
- [ ] Test with screen reader (NVDA, JAWS, VoiceOver)
- [ ] Test with browser zoom at 200% and 400%
- [ ] Test with high contrast mode
- [ ] Test with dark mode
- [ ] Test with reduced motion preference
- [ ] Test with different font sizes
- [ ] Test with different viewport sizes
- [ ] Test color contrast with tools (WebAIM, Lighthouse)
- [ ] Test with assistive technologies

## Compliance Verification

### Tools

- **Automated**: axe DevTools, Lighthouse, WAVE
- **Manual**: Screen readers, keyboard testing
- **Color contrast**: WebAIM Contrast Checker
- **Code validation**: W3C Validator, ESLint a11y plugin

### Documentation

- Document all accessibility features
- Provide keyboard shortcut reference
- Include accessibility statement
- Maintain VPAT (Voluntary Product Accessibility Template)

## Resources

- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Resources](https://webaim.org/)
- [A11y Project](https://www.a11yproject.com/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

## Enforcement

- All UI components MUST pass automated accessibility tests
- All UI components MUST be manually tested with keyboard and screen reader
- All color combinations MUST meet WCAG AAA contrast requirements
- All new features MUST include accessibility considerations in design phase
- Accessibility violations are treated as critical bugs and must be fixed before release
