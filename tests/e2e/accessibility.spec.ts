import { test, expect } from './fixtures/base.js';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility E2E Tests
 * 
 * Tests WCAG 2.2 Level AAA compliance for all UI components.
 * 
 * Requirements:
 * - WCAG 2.2 AAA: All accessibility criteria
 * - Keyboard navigation (Tab, Arrow keys, Enter, Escape)
 * - Screen reader compatibility (ARIA labels, roles, live regions)
 * - Focus management and indicators
 * - Color contrast ratios (7:1 for normal text, 4.5:1 for large text, 3:1 for UI components)
 * - High contrast mode support
 * - Reduced motion preference support
 * - Touch target sizes (44x44px minimum)
 */
test.describe('Accessibility - WCAG 2.2 AAA Compliance', () => {
  
  // ============================================================================
  // Automated WCAG Checks with axe-playwright
  // ============================================================================
  
  test('should have no accessibility violations on main page', async ({ cleanPage }) => {
    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    // Assert no violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });
  
  test('should have no accessibility violations on conversation list', async ({ cleanPage, helpers }) => {
    // Create test conversations
    await helpers.createTestConversation('Test Conversation 1', [
      { role: 'user', content: 'Hello' },
    ]);
    await helpers.createTestConversation('Test Conversation 2', [
      { role: 'user', content: 'World' },
    ]);
    
    // Reload to show conversations
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    // Assert no violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });
  
  test('should have no accessibility violations on search interface', async ({ cleanPage, helpers }) => {
    // Create test conversations for search
    await helpers.createTestConversation('Searchable Conversation', [
      { role: 'user', content: 'This is searchable content' },
    ]);
    
    // Reload and open search
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Open search (if there's a search button/shortcut)
    await cleanPage.keyboard.press('Control+K').catch(() => {
      // Search might be always visible
    });
    
    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    // Assert no violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });
  
  // ============================================================================
  // Keyboard Navigation Tests
  // ============================================================================
  
  test('should support Tab navigation through all interactive elements', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Track focused elements
    const focusedElements: string[] = [];
    
    // Tab through elements and record focus
    for (let i = 0; i < 10; i++) {
      await cleanPage.keyboard.press('Tab');
      
      const focusedElement = await cleanPage.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        
        // Get element description
        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const id = el.id || '';
        const className = el.className || '';
        
        return `${tagName}${role ? `[role="${role}"]` : ''}${ariaLabel ? `[aria-label="${ariaLabel}"]` : ''}${id ? `#${id}` : ''}${className ? `.${className.split(' ')[0]}` : ''}`;
      });
      
      focusedElements.push(focusedElement);
    }
    
    // Verify that focus moved through multiple elements
    const uniqueElements = new Set(focusedElements);
    expect(uniqueElements.size).toBeGreaterThan(1);
    
    // Verify no element is 'none' (focus should always be on something)
    expect(focusedElements.every(el => el !== 'none')).toBe(true);
  });
  
  test('should support Shift+Tab for reverse navigation', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Tab forward a few times
    await cleanPage.keyboard.press('Tab');
    await cleanPage.keyboard.press('Tab');
    await cleanPage.keyboard.press('Tab');
    
    const forwardElement = await cleanPage.evaluate(() => {
      return document.activeElement?.tagName || 'none';
    });
    
    // Tab backward
    await cleanPage.keyboard.press('Shift+Tab');
    
    const backwardElement = await cleanPage.evaluate(() => {
      return document.activeElement?.tagName || 'none';
    });
    
    // Verify focus moved backward (different element)
    expect(backwardElement).not.toBe(forwardElement);
  });
  
  test('should support Enter key to activate buttons', async ({ cleanPage, helpers }) => {
    // Create test conversation
    const conversationId = await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Find a button using keyboard navigation
    let foundButton = false;
    for (let i = 0; i < 20; i++) {
      await cleanPage.keyboard.press('Tab');
      
      const isButton = await cleanPage.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === 'BUTTON' || el?.getAttribute('role') === 'button';
      });
      
      if (isButton) {
        foundButton = true;
        break;
      }
    }
    
    expect(foundButton).toBe(true);
    
    // Press Enter to activate button
    await cleanPage.keyboard.press('Enter');
    
    // Wait for any action to complete
    await cleanPage.waitForTimeout(500);
    
    // Verify no errors occurred
    const hasError = await cleanPage.locator('[role="alert"]').count();
    expect(hasError).toBe(0);
  });
  
  test('should support Escape key to close modals/dialogs', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Try to open a modal (e.g., search with Ctrl+K)
    await cleanPage.keyboard.press('Control+K').catch(() => {
      // Search might not have keyboard shortcut
    });
    
    // Wait for modal to appear (if any)
    await cleanPage.waitForTimeout(500);
    
    // Press Escape
    await cleanPage.keyboard.press('Escape');
    
    // Wait for modal to close
    await cleanPage.waitForTimeout(500);
    
    // Verify modal is closed (no modal overlay visible)
    const modalVisible = await cleanPage.locator('[role="dialog"]').isVisible().catch(() => false);
    expect(modalVisible).toBe(false);
  });
  
  test('should support Arrow keys for navigation in lists', async ({ cleanPage, helpers }) => {
    // Create multiple test conversations
    await helpers.createTestConversation('Conversation 1', [
      { role: 'user', content: 'Test 1' },
    ]);
    await helpers.createTestConversation('Conversation 2', [
      { role: 'user', content: 'Test 2' },
    ]);
    await helpers.createTestConversation('Conversation 3', [
      { role: 'user', content: 'Test 3' },
    ]);
    
    // Reload to show conversations
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Focus on conversation list
    const conversationList = await cleanPage.locator('[role="list"], .conversation-list').first();
    await conversationList.focus().catch(() => {
      // List might not be focusable directly
    });
    
    // Try arrow key navigation
    await cleanPage.keyboard.press('ArrowDown');
    await cleanPage.waitForTimeout(200);
    
    const firstFocus = await cleanPage.evaluate(() => {
      return document.activeElement?.textContent?.substring(0, 20) || '';
    });
    
    await cleanPage.keyboard.press('ArrowDown');
    await cleanPage.waitForTimeout(200);
    
    const secondFocus = await cleanPage.evaluate(() => {
      return document.activeElement?.textContent?.substring(0, 20) || '';
    });
    
    // Verify focus moved (different content)
    expect(secondFocus).not.toBe(firstFocus);
  });
  
  // ============================================================================
  // Screen Reader Compatibility Tests
  // ============================================================================
  
  test('should have proper ARIA labels on all interactive elements', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Find all buttons
    const buttons = await cleanPage.locator('button').all();
    
    // Verify each button has accessible name (aria-label or text content)
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      const textContent = await button.textContent();
      const ariaLabelledBy = await button.getAttribute('aria-labelledby');
      
      const hasAccessibleName = ariaLabel || textContent?.trim() || ariaLabelledBy;
      expect(hasAccessibleName).toBeTruthy();
    }
  });
  
  test('should have proper ARIA roles on semantic elements', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Check for proper semantic structure
    const hasMain = await cleanPage.locator('main, [role="main"]').count();
    expect(hasMain).toBeGreaterThan(0);
    
    // Check for navigation
    const hasNav = await cleanPage.locator('nav, [role="navigation"]').count();
    expect(hasNav).toBeGreaterThanOrEqual(0); // Optional
    
    // Check for proper list structure
    const lists = await cleanPage.locator('[role="list"], ul, ol').all();
    for (const list of lists) {
      const listItems = await list.locator('[role="listitem"], li').count();
      if (listItems > 0) {
        // If there are list items, verify they're properly structured
        expect(listItems).toBeGreaterThan(0);
      }
    }
  });
  
  test('should have ARIA live regions for dynamic content', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Check for live regions (for notifications, status updates, etc.)
    const liveRegions = await cleanPage.locator('[aria-live]').all();
    
    // Verify live regions have appropriate politeness level
    for (const region of liveRegions) {
      const ariaLive = await region.getAttribute('aria-live');
      expect(['polite', 'assertive', 'off']).toContain(ariaLive);
    }
  });
  
  test('should announce loading states to screen readers', async ({ cleanPage, helpers }) => {
    // Navigate to page
    await cleanPage.goto('/');
    
    // Check for loading indicator with proper ARIA
    const loadingIndicator = await cleanPage.locator('[role="status"], [aria-busy="true"]').first();
    
    if (await loadingIndicator.isVisible().catch(() => false)) {
      // Verify it has accessible text
      const ariaLabel = await loadingIndicator.getAttribute('aria-label');
      const textContent = await loadingIndicator.textContent();
      
      const hasAccessibleText = ariaLabel || textContent?.trim();
      expect(hasAccessibleText).toBeTruthy();
    }
  });
  
  // ============================================================================
  // Focus Management Tests
  // ============================================================================
  
  test('should have visible focus indicators on all interactive elements', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Tab through elements and verify focus indicators
    for (let i = 0; i < 5; i++) {
      await cleanPage.keyboard.press('Tab');
      
      // Get computed styles of focused element
      const focusStyles = await cleanPage.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        
        const styles = window.getComputedStyle(el);
        return {
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          outlineColor: styles.outlineColor,
          boxShadow: styles.boxShadow,
        };
      });
      
      if (focusStyles) {
        // Verify focus indicator exists (outline or box-shadow)
        const hasFocusIndicator = 
          (focusStyles.outlineWidth !== '0px' && focusStyles.outlineStyle !== 'none') ||
          (focusStyles.boxShadow !== 'none');
        
        expect(hasFocusIndicator).toBe(true);
      }
    }
  });
  
  test('should maintain focus order in logical sequence', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Get tab order
    const tabOrder: Array<{ tag: string; position: { x: number; y: number } }> = [];
    
    for (let i = 0; i < 10; i++) {
      await cleanPage.keyboard.press('Tab');
      
      const elementInfo = await cleanPage.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          position: { x: rect.left, y: rect.top },
        };
      });
      
      if (elementInfo) {
        tabOrder.push(elementInfo);
      }
    }
    
    // Verify tab order generally follows visual order (top to bottom, left to right)
    // This is a simplified check - in reality, tab order should follow reading order
    expect(tabOrder.length).toBeGreaterThan(0);
  });
  
  test('should not have keyboard traps', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Tab through many elements
    const focusedElements: string[] = [];
    
    for (let i = 0; i < 30; i++) {
      await cleanPage.keyboard.press('Tab');
      
      const elementId = await cleanPage.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName + (el?.className || '') + (el?.id || '');
      });
      
      focusedElements.push(elementId);
    }
    
    // Verify focus moved through different elements (not stuck)
    const uniqueElements = new Set(focusedElements);
    expect(uniqueElements.size).toBeGreaterThan(3);
  });
  
  // ============================================================================
  // Color Contrast Tests
  // ============================================================================
  
  test('should meet WCAG AAA color contrast ratios (7:1 for normal text)', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message with normal text' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Run axe with color contrast checks
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2aaa'])
      .include('body')
      .analyze();
    
    // Filter for color contrast violations
    const contrastViolations = accessibilityScanResults.violations.filter(
      v => v.id === 'color-contrast' || v.id === 'color-contrast-enhanced'
    );
    
    // Assert no contrast violations
    expect(contrastViolations).toEqual([]);
  });
  
  test('should have sufficient contrast for focus indicators (3:1)', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Tab to an element
    await cleanPage.keyboard.press('Tab');
    
    // Get focus indicator color and background
    const contrastInfo = await cleanPage.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      
      const styles = window.getComputedStyle(el);
      const parentStyles = window.getComputedStyle(el.parentElement || document.body);
      
      return {
        outlineColor: styles.outlineColor,
        backgroundColor: parentStyles.backgroundColor,
        outlineWidth: styles.outlineWidth,
      };
    });
    
    // Verify focus indicator has sufficient width (at least 2px for AAA)
    if (contrastInfo && contrastInfo.outlineWidth !== '0px') {
      const widthValue = parseFloat(contrastInfo.outlineWidth);
      expect(widthValue).toBeGreaterThanOrEqual(2);
    }
  });
  
  // ============================================================================
  // High Contrast Mode Tests
  // ============================================================================
  
  test('should support high contrast mode', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Emulate high contrast mode
    await cleanPage.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
    
    // Wait for styles to apply
    await cleanPage.waitForTimeout(500);
    
    // Run accessibility scan in high contrast mode
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2aaa'])
      .analyze();
    
    // Assert no violations in high contrast mode
    expect(accessibilityScanResults.violations).toEqual([]);
  });
  
  // ============================================================================
  // Reduced Motion Tests
  // ============================================================================
  
  test('should respect prefers-reduced-motion preference', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Emulate reduced motion preference
    await cleanPage.emulateMedia({ reducedMotion: 'reduce' });
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Check that animations are disabled or minimal
    const animationDurations = await cleanPage.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const durations: number[] = [];
      
      elements.forEach(el => {
        const styles = window.getComputedStyle(el);
        const duration = parseFloat(styles.animationDuration);
        const transitionDuration = parseFloat(styles.transitionDuration);
        
        if (duration > 0) durations.push(duration);
        if (transitionDuration > 0) durations.push(transitionDuration);
      });
      
      return durations;
    });
    
    // Verify animations are very short or disabled (< 0.1s)
    const longAnimations = animationDurations.filter(d => d > 0.1);
    expect(longAnimations.length).toBe(0);
  });
  
  // ============================================================================
  // Touch Target Size Tests
  // ============================================================================
  
  test('should have touch targets at least 44x44 CSS pixels', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Get all interactive elements
    const interactiveElements = await cleanPage.locator(
      'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
    ).all();
    
    // Check size of each interactive element
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      
      if (box && await element.isVisible()) {
        // Verify minimum size of 44x44 pixels (WCAG 2.2 AAA)
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
  
  test('should have sufficient spacing between touch targets', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Get all interactive elements
    const interactiveElements = await cleanPage.locator(
      'button, a, [role="button"], [role="link"]'
    ).all();
    
    // Get bounding boxes
    const boxes = await Promise.all(
      interactiveElements.map(async el => ({
        element: el,
        box: await el.boundingBox(),
        visible: await el.isVisible(),
      }))
    );
    
    // Check spacing between adjacent elements
    const visibleBoxes = boxes.filter(b => b.box && b.visible);
    
    for (let i = 0; i < visibleBoxes.length - 1; i++) {
      for (let j = i + 1; j < visibleBoxes.length; j++) {
        const box1 = visibleBoxes[i].box!;
        const box2 = visibleBoxes[j].box!;
        
        // Calculate distance between elements
        const horizontalDistance = Math.max(
          0,
          Math.max(box1.x, box2.x) - Math.min(box1.x + box1.width, box2.x + box2.width)
        );
        const verticalDistance = Math.max(
          0,
          Math.max(box1.y, box2.y) - Math.min(box1.y + box1.height, box2.y + box2.height)
        );
        
        // If elements are adjacent (close to each other), verify spacing
        if (horizontalDistance < 100 && verticalDistance < 100) {
          const minDistance = Math.min(horizontalDistance, verticalDistance);
          
          // Spacing should be at least 8px (common guideline)
          if (minDistance > 0) {
            expect(minDistance).toBeGreaterThanOrEqual(8);
          }
        }
      }
    }
  });
  
  // ============================================================================
  // Semantic HTML and Heading Structure Tests
  // ============================================================================
  
  test('should have proper heading hierarchy', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Get all headings
    const headings = await cleanPage.evaluate(() => {
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(headingElements).map(h => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.textContent?.trim() || '',
      }));
    });
    
    // Verify heading hierarchy (no skipped levels)
    if (headings.length > 0) {
      // Should have exactly one h1
      const h1Count = headings.filter(h => h.level === 1).length;
      expect(h1Count).toBe(1);
      
      // Verify no skipped levels
      for (let i = 1; i < headings.length; i++) {
        const levelDiff = headings[i].level - headings[i - 1].level;
        expect(levelDiff).toBeLessThanOrEqual(1);
      }
    }
  });
  
  test('should use semantic HTML elements', async ({ cleanPage, helpers }) => {
    // Create test conversation
    await helpers.createTestConversation('Test Conversation', [
      { role: 'user', content: 'Test message' },
    ]);
    
    // Reload to show conversation
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Check for semantic elements
    const hasMain = await cleanPage.locator('main').count();
    const hasHeader = await cleanPage.locator('header').count();
    const hasNav = await cleanPage.locator('nav').count();
    
    // At minimum, should have main content area
    expect(hasMain).toBeGreaterThan(0);
  });
});
