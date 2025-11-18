# Conversation Search User Guide

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Search Syntax](#search-syntax)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Search Results](#search-results)
- [Pagination](#pagination)
- [Keyword Highlighting](#keyword-highlighting)
- [Accessibility Features](#accessibility-features)
- [Tips and Tricks](#tips-and-tricks)
- [Troubleshooting](#troubleshooting)

## Overview

The Conversation Search feature allows you to quickly find specific information across all your conversations and messages. With full-text search, keyword highlighting, and intelligent pagination, you can locate any conversation or message in seconds.

### Key Features

- **Fast Search**: Results appear in under 500ms
- **Full-Text**: Searches both conversation titles and message content
- **Keyword Highlighting**: Visual highlighting of matched terms
- **Context Display**: Shows text around matches for context
- **Pagination**: Navigate through large result sets easily
- **Keyboard Navigation**: Full keyboard support for efficiency
- **Accessibility**: WCAG 2.2 AAA compliant for all users

## Getting Started

### Opening Search

There are multiple ways to open the search interface:

1. **Keyboard Shortcut**: Press `Ctrl+K` (or `Cmd+K` on Mac)
2. **Search Button**: Click the search icon in the navigation bar
3. **Menu**: Select "Search Conversations" from the menu

### Basic Search

1. Type your search query in the search box
2. Results appear automatically as you type (300ms debounce)
3. Click on any result to open that conversation
4. The conversation opens and scrolls to the first match

### Closing Search

- Press `Escape` to clear the search and close
- Click outside the search area
- Click the close button (×)

## Search Syntax

### Simple Keywords

Search for single or multiple keywords:

```
authentication
```

Finds all conversations containing "authentication"

```
error handling
```

Finds conversations containing both "error" AND "handling"

### Case Sensitivity

**Default: Case-Insensitive**

By default, search is case-insensitive:
- `API` matches "api", "API", "Api"
- `error` matches "Error", "ERROR", "error"

**Case-Sensitive Search**

To enable case-sensitive search:
1. Click the "Aa" button in the search bar
2. Or use the settings menu

With case-sensitive enabled:
- `API` only matches "API"
- `error` only matches "error"

### Search Scope

Search looks in:
- **Conversation Titles**: Weighted higher in results
- **Message Content**: All user and assistant messages
- **Timestamps**: Recent conversations ranked higher

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open search |
| `Escape` | Clear search / Close |

### Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| `ArrowDown` | Move to next result |
| `ArrowUp` | Move to previous result |
| `Enter` | Open selected result |
| `Space` | Open selected result |
| `Home` | Jump to first result |
| `End` | Jump to last result |

### Pagination Shortcuts

| Shortcut | Action |
|----------|--------|
| `PageDown` | Next page of results |
| `PageUp` | Previous page of results |
| `Ctrl+ArrowRight` | Next page |
| `Ctrl+ArrowLeft` | Previous page |

### In-Conversation Shortcuts

When viewing a conversation from search:

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Find next occurrence |
| `Ctrl+Shift+F` | Find previous occurrence |
| `Escape` | Exit find mode |

## Search Results

### Result Display

Each search result shows:

1. **Conversation Title**: With highlighted keywords
2. **Match Count**: Number of keyword occurrences
3. **Context Preview**: Text around the first match
4. **Timestamp**: When the conversation was last updated
5. **Role Indicator**: User or Assistant message

### Result Ranking

Results are ranked by relevance:

1. **Title Matches**: Highest priority (10x weight)
2. **Recent Conversations**: More recent = higher rank
3. **Multiple Matches**: More occurrences = higher rank
4. **Keyword Proximity**: Closer keywords = higher rank

### Result Actions

**Click a Result**:
- Opens the conversation
- Scrolls to the first keyword occurrence
- Highlights all keyword occurrences
- Shows navigation controls

**Hover Over Result**:
- Shows full context preview
- Displays all match locations
- Highlights the result

**Keyboard Selection**:
- Use arrow keys to navigate
- Press Enter to open
- Tab to move between elements

## Pagination

### Overview

Search results are paginated with 20 results per page for optimal performance.

### Navigation

**Page Controls**:
- **Previous Button**: Go to previous page
- **Next Button**: Go to next page
- **Page Numbers**: Click to jump to specific page
- **Current Page**: Highlighted in blue

**Keyboard Navigation**:
- `PageDown`: Next page
- `PageUp`: Previous page
- `Ctrl+ArrowRight`: Next page
- `Ctrl+ArrowLeft`: Previous page

### Prefetching

For faster navigation:
- **First 3 Pages**: Loaded immediately (60 results)
- **Additional Pages**: Loaded on demand
- **Cache**: Results cached for instant navigation
- **Background Loading**: Next pages prefetched automatically

### Page Information

The pagination bar shows:
- Current page number
- Total number of pages
- Total number of results
- Results range (e.g., "1-20 of 150")

## Keyword Highlighting

### In Search Results

Keywords are highlighted in:
- **Conversation Titles**: Yellow background
- **Context Previews**: Yellow background with bold text
- **Match Count**: Shows total occurrences

### In Conversations

When you open a conversation from search:

1. **All Matches Highlighted**: Every keyword occurrence is highlighted
2. **Current Match**: Highlighted in bright yellow
3. **Other Matches**: Highlighted in light yellow
4. **Navigation Controls**: Previous/Next buttons appear

### Navigation Between Matches

**Using Controls**:
- Click "Previous" to go to previous match
- Click "Next" to go to next match
- Counter shows "2 of 5" (current of total)

**Using Keyboard**:
- `Ctrl+F`: Next match
- `Ctrl+Shift+F`: Previous match
- `Escape`: Exit find mode

### Highlight Colors

**Light Mode**:
- Current match: `#FFEB3B` (bright yellow)
- Other matches: `#FFF9C4` (light yellow)
- Text: `#000000` (black, 21:1 contrast)

**Dark Mode**:
- Current match: `#FFD700` (gold)
- Other matches: `#FFF59D` (pale yellow)
- Text: `#000000` (black, 21:1 contrast)

**High Contrast Mode**:
- Current match: `#FFFF00` (pure yellow)
- Other matches: `#FFFF99` (light yellow)
- Text: `#000000` (black)

## Accessibility Features

### WCAG 2.2 AAA Compliance

The search interface meets the highest accessibility standards:

#### Visual Accessibility

**Color Contrast**:
- All text: 7:1 contrast ratio (AAA)
- Large text: 4.5:1 contrast ratio (AAA)
- UI components: 3:1 contrast ratio
- Focus indicators: 3:1 contrast ratio

**Color Independence**:
- Never relies on color alone
- Keywords use both color AND bold text
- Icons have text labels
- Status indicated with text and icons

**Responsive Design**:
- Text resizable up to 200%
- Zoom up to 400% without horizontal scroll
- Reflow for different viewport sizes
- Portrait and landscape support

#### Keyboard Accessibility

**Full Keyboard Access**:
- All features accessible via keyboard
- No keyboard traps
- Logical tab order
- Skip links available

**Focus Indicators**:
- 3px outline on all interactive elements
- High contrast focus indicators
- Always visible
- Never hidden

**Keyboard Shortcuts**:
- Documented and discoverable
- Customizable (coming soon)
- No conflicts with browser shortcuts
- Work with screen readers

#### Screen Reader Support

**ARIA Labels**:
- All interactive elements labeled
- Form fields have labels
- Buttons have descriptive text
- Links indicate destination

**Live Regions**:
- Search results announced
- Page changes announced
- Errors announced immediately
- Status updates announced

**Semantic HTML**:
- Proper heading hierarchy (h1 → h2 → h3)
- Landmark regions (search, navigation, main)
- Lists for list content
- Tables for tabular data

**Role Attributes**:
- `role="search"` for search container
- `role="searchbox"` for search input
- `role="region"` for results area
- `role="navigation"` for pagination

#### Motion & Animation

**Reduced Motion**:
- Respects `prefers-reduced-motion`
- Animations disabled when requested
- Instant transitions instead
- No auto-playing content

**Safe Animations**:
- Subtle fade-ins (300ms)
- Smooth scrolling (when enabled)
- No flashing or strobing
- User-controlled

### Assistive Technology Support

**Screen Readers**:
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (macOS/iOS)
- TalkBack (Android)

**Magnification**:
- ZoomText
- Windows Magnifier
- macOS Zoom
- Browser zoom

**Voice Control**:
- Dragon NaturallySpeaking
- Windows Speech Recognition
- macOS Dictation
- Voice Access (Android)

## Tips and Tricks

### Efficient Searching

**Use Specific Keywords**:
- ✅ "authentication error 401"
- ❌ "problem"

**Search Titles First**:
- Titles are weighted higher
- More likely to find what you need
- Faster to scan

**Use Multiple Keywords**:
- Narrows down results
- More relevant matches
- Better ranking

### Finding Recent Conversations

**Sort by Date**:
- Recent conversations ranked higher
- Use date-related keywords
- Check "Recent" filter (coming soon)

### Finding Specific Messages

**Use Unique Terms**:
- Technical terms
- Error codes
- Function names
- Specific phrases

**Use Context**:
- Words around the target
- Related concepts
- Associated terms

### Navigating Large Result Sets

**Use Pagination**:
- Jump to specific pages
- Use keyboard shortcuts
- Prefetching makes it fast

**Refine Your Search**:
- Add more keywords
- Use case-sensitive search
- Filter by date (coming soon)

### Performance Tips

**Clear Cache Periodically**:
- Refresh the page
- Clears search cache
- Rebuilds index

**Limit Result Count**:
- Use specific keywords
- Narrow search scope
- Filter results

## Troubleshooting

### No Results Found

**Possible Causes**:
1. Typo in search query
2. Case-sensitive search enabled
3. Conversation deleted
4. Search index not built

**Solutions**:
1. Check spelling
2. Disable case-sensitive search
3. Verify conversation exists
4. Rebuild search index (refresh page)

### Slow Search

**Possible Causes**:
1. Large number of conversations
2. Search index not built
3. Browser performance issues
4. Network latency

**Solutions**:
1. Wait for index to build (first search)
2. Refresh the page
3. Close other tabs
4. Check browser console for errors

### Highlighting Not Working

**Possible Causes**:
1. Browser extension interference
2. Custom CSS overrides
3. High contrast mode issues
4. JavaScript errors

**Solutions**:
1. Disable browser extensions
2. Reset custom styles
3. Check browser console
4. Refresh the page

### Keyboard Shortcuts Not Working

**Possible Causes**:
1. Browser extension conflict
2. Operating system shortcuts
3. Focus not in search area
4. Accessibility mode enabled

**Solutions**:
1. Disable conflicting extensions
2. Check OS keyboard settings
3. Click in search box first
4. Use mouse as alternative

### Pagination Issues

**Possible Causes**:
1. Cache corruption
2. Network errors
3. Browser storage full
4. JavaScript errors

**Solutions**:
1. Clear browser cache
2. Check network connection
3. Free up storage space
4. Refresh the page

### Accessibility Issues

**Screen Reader Not Announcing**:
1. Check screen reader settings
2. Verify ARIA support
3. Update screen reader
4. Try different browser

**Focus Not Visible**:
1. Check browser zoom level
2. Verify focus indicator styles
3. Disable custom themes
4. Check high contrast mode

**Keyboard Navigation Broken**:
1. Check for JavaScript errors
2. Verify focus management
3. Test in different browser
4. Report bug with details

## Getting Help

### Support Resources

**Documentation**:
- [Main README](../../apps/frontend/README.md)
- [API Documentation](../api/)
- [Troubleshooting Guide](../TROUBLESHOOTING.md)

**Community**:
- GitHub Issues
- Discussion Forum
- Stack Overflow

**Contact**:
- Email: support@example.com
- Chat: Available in app
- Phone: 1-800-SUPPORT

### Reporting Issues

When reporting search issues, include:

1. **Search Query**: Exact keywords used
2. **Expected Results**: What you expected to find
3. **Actual Results**: What actually happened
4. **Browser**: Name and version
5. **Screenshots**: If applicable
6. **Console Errors**: From browser developer tools
7. **Steps to Reproduce**: Detailed steps

### Feature Requests

We welcome feature requests! Please include:

1. **Use Case**: Why you need this feature
2. **Description**: What the feature should do
3. **Examples**: How it would work
4. **Priority**: How important it is to you
5. **Alternatives**: What you're doing now

## Appendix

### Search Performance Metrics

| Metric | Target | Typical |
|--------|--------|---------|
| Search Latency | <500ms | 200-300ms |
| Index Build Time | <5s | 2-3s |
| Result Display | <100ms | 50ms |
| Page Navigation | <50ms | 20ms |
| Highlight Rendering | <100ms | 50ms |

### Supported Browsers

| Browser | Minimum Version | Recommended |
|---------|----------------|-------------|
| Chrome | 90+ | Latest |
| Firefox | 88+ | Latest |
| Safari | 14+ | Latest |
| Edge | 90+ | Latest |

### Storage Requirements

| Data | Size | Notes |
|------|------|-------|
| Search Index | ~1MB per 1000 conversations | In-memory |
| Cache | ~500KB per 100 results | Session storage |
| Metadata | ~10KB | Persistent |

### Keyboard Shortcut Reference Card

Print this for quick reference:

```
┌─────────────────────────────────────────┐
│     CONVERSATION SEARCH SHORTCUTS       │
├─────────────────────────────────────────┤
│ Open Search         Ctrl+K              │
│ Close Search        Escape              │
│ Next Result         ArrowDown           │
│ Previous Result     ArrowUp             │
│ Open Result         Enter               │
│ First Result        Home                │
│ Last Result         End                 │
│ Next Page           PageDown            │
│ Previous Page       PageUp              │
│ Next Match          Ctrl+F              │
│ Previous Match      Ctrl+Shift+F        │
└─────────────────────────────────────────┘
```

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
**Feedback**: Please report issues or suggestions via GitHub Issues
