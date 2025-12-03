# Manual Accessibility Testing Checklist

## Overview
This checklist should be completed manually to verify accessibility compliance after code quality improvements.

## Keyboard Navigation Testing

### ✅ Tasks to Complete:
- [ ] Navigate through all interactive elements using Tab key
- [ ] Verify Tab order is logical and follows visual flow
- [ ] Test Shift+Tab for reverse navigation
- [ ] Verify all buttons are reachable via keyboard
- [ ] Test Enter/Space keys activate buttons and links
- [ ] Test Escape key closes modals and dialogs
- [ ] Verify no keyboard traps exist
- [ ] Test arrow keys for navigation where applicable

### Expected Results:
- All interactive elements should be keyboard accessible
- Focus indicators should be clearly visible
- Tab order should match visual layout
- No elements should trap keyboard focus

## Screen Reader Testing

### ✅ Tasks to Complete (VoiceOver on macOS or NVDA on Windows):
- [ ] Enable screen reader
- [ ] Navigate through main navigation
- [ ] Verify all images have appropriate alt text
- [ ] Test form labels are properly announced
- [ ] Verify button purposes are clear
- [ ] Test ARIA live regions announce dynamic content
- [ ] Verify dialog/modal announcements
- [ ] Test landmark regions (header, nav, main, footer)

### Expected Results:
- All content should be announced clearly
- Interactive elements should have descriptive labels
- Dynamic content changes should be announced
- Page structure should be clear through landmarks

## Semantic HTML Verification

### ✅ Elements to Check:
- [ ] Buttons use `<button>` elements (not div with role="button")
- [ ] Dialogs use `<dialog>` elements (not div with role="dialog")
- [ ] Sections use `<section>` elements (not div with role="region")
- [ ] Status messages use `<output>` elements (not div with role="status")
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Lists use `<ul>`, `<ol>`, `<li>` elements
- [ ] Forms use proper `<label>` elements

### Expected Results:
- All interactive elements should use semantic HTML
- ARIA roles should only be used when semantic HTML is insufficient
- Document structure should be clear and logical

## Focus Management Testing

### ✅ Tasks to Complete:
- [ ] Open a modal/dialog - verify focus moves to dialog
- [ ] Close modal - verify focus returns to trigger element
- [ ] Navigate through form fields - verify focus moves logically
- [ ] Test focus trap in modals (Tab should cycle within modal)
- [ ] Verify focus indicators are visible on all elements
- [ ] Test focus management in dynamic content updates

### Expected Results:
- Focus should move predictably
- Focus should be trapped in modals
- Focus should return to appropriate elements after modal close
- Focus indicators should always be visible

## Color Contrast Testing

### ✅ Tasks to Complete:
- [ ] Use browser DevTools or WebAIM Contrast Checker
- [ ] Verify text has minimum 7:1 contrast ratio (AAA)
- [ ] Verify large text has minimum 4.5:1 contrast ratio
- [ ] Verify UI components have minimum 3:1 contrast ratio
- [ ] Test in both light and dark modes
- [ ] Verify focus indicators have sufficient contrast

### Expected Results:
- All text should meet WCAG AAA contrast requirements
- UI components should be clearly distinguishable
- Focus indicators should be clearly visible

## Testing Tools

### Recommended Tools:
- **Keyboard**: Built-in keyboard navigation
- **Screen Readers**: 
  - macOS: VoiceOver (Cmd+F5)
  - Windows: NVDA (free) or JAWS
- **Contrast Checkers**:
  - WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
  - Chrome DevTools: Inspect element → Accessibility panel
- **Browser Extensions**:
  - axe DevTools
  - WAVE Evaluation Tool
  - Lighthouse (Chrome DevTools)

## Issues Found

### Document any issues here:

#### Issue 1:
- **Component**: 
- **Problem**: 
- **Severity**: (Critical/High/Medium/Low)
- **Steps to Reproduce**: 
- **Expected Behavior**: 
- **Actual Behavior**: 

#### Issue 2:
- **Component**: 
- **Problem**: 
- **Severity**: 
- **Steps to Reproduce**: 
- **Expected Behavior**: 
- **Actual Behavior**: 

## Sign-off

- **Tester Name**: _______________
- **Date**: _______________
- **Overall Result**: ☐ Pass ☐ Pass with Minor Issues ☐ Fail
- **Notes**: 

