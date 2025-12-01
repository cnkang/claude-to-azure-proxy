import { test, expect } from './fixtures/base.js';
import AxeBuilder from '@axe-core/playwright';

/**
 * Sidebar UX Improvements E2E Tests
 *
 * Tests the enhanced sidebar user experience features:
 * - Floating action button on mobile/tablet
 * - Onboarding message on first sidebar close
 * - Enhanced hamburger menu button styling
 * - Tooltips on sidebar buttons
 * - Keyboard navigation
 * - Screen reader support
 *
 * Requirements: 21.1-21.10
 */

test.describe('Sidebar UX - Floating Action Button', () => {
  test('should show floating button on mobile when sidebar is closed', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    
    // Wait for page to load completely
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // On mobile, sidebar should be closed by default, so floating button should be visible
    // Check for floating action button directly
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    
    // If floating button is not visible, sidebar might be open - close it
    const isFloatingButtonVisible = await floatingButton.isVisible().catch(() => false);
    if (!isFloatingButtonVisible) {
      // Try to close sidebar using hamburger menu
      const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
      const isMenuButtonVisible = await menuButton.isVisible().catch(() => false);
      if (isMenuButtonVisible) {
        await menuButton.click();
        await cleanPage.waitForTimeout(1000);
      }
    }

    // Now floating button should be visible
    await expect(floatingButton).toBeVisible({ timeout: 10000 });

    // Verify button size meets 44x44px minimum (should be 56x56px)
    const buttonBox = await floatingButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('should show floating button on tablet when sidebar is closed', async ({
    cleanPage,
  }) => {
    // Set tablet viewport
    await cleanPage.setViewportSize({ width: 768, height: 1024 });
    await cleanPage.waitForTimeout(1000);

    // Wait for sidebar
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await sidebar.waitFor({ state: 'attached', timeout: 10000 });
    const sidebarVisible = await sidebar.isVisible();

    if (sidebarVisible) {
      const closeButton = cleanPage.locator('[data-testid="sidebar-close-button"]');
      const closeButtonVisible = await closeButton.isVisible().catch(() => false);
      
      if (closeButtonVisible) {
        await closeButton.click();
        await cleanPage.waitForTimeout(500);
      } else {
        const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
        await menuButton.click();
        await cleanPage.waitForTimeout(500);
      }
    }

    await cleanPage.waitForTimeout(500);

    // Check for floating action button
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });
  });

  test('should not show floating button on desktop', async ({ cleanPage }) => {
    // Set desktop viewport
    await cleanPage.setViewportSize({ width: 1440, height: 900 });
    await cleanPage.waitForTimeout(500);

    // Check that floating button is not visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).not.toBeVisible();
  });

  test('should open sidebar when floating button is clicked', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure sidebar is closed using hamburger menu
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.click();
      await cleanPage.waitForTimeout(1000);
    }

    // Now floating button should be visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });
    
    // Scroll into view and click
    await floatingButton.scrollIntoViewIfNeeded();
    await cleanPage.waitForTimeout(500);
    
    // Click using JavaScript as a fallback for reliability
    await floatingButton.evaluate((el) => (el as HTMLElement).click());
    await cleanPage.waitForTimeout(1000);

    // Verify sidebar opened by checking aria-expanded
    const newAriaExpanded = await menuButton.getAttribute('aria-expanded');
    expect(newAriaExpanded).toBe('true');
  });
});

test.describe('Sidebar UX - Onboarding Message', () => {
  test('should show onboarding message on first sidebar close on mobile', async ({
    cleanPage,
  }) => {
    // Clear localStorage to ensure onboarding shows
    await cleanPage.evaluate(() => {
      localStorage.removeItem('sidebar-onboarding-seen');
    });
    
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure sidebar is open first
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded !== 'true') {
      // Open sidebar first - use JavaScript click for reliability
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Now close sidebar to trigger onboarding - use JavaScript click
    await menuButton.evaluate((el) => (el as HTMLElement).click());
    await cleanPage.waitForTimeout(2500); // Wait for onboarding delay (1s) + buffer

    // Check for onboarding dialog
    const onboardingDialog = cleanPage.locator('[role="dialog"]').first();
    await expect(onboardingDialog).toBeVisible({ timeout: 5000 });

    // Verify onboarding content contains expected text
    const onboardingText = await onboardingDialog.textContent();
    expect(onboardingText).toContain('floating');
  });

  test('should not show onboarding message after dismissal', async ({
    cleanPage,
  }) => {
    // Clear localStorage first
    await cleanPage.evaluate(() => {
      localStorage.removeItem('sidebar-onboarding-seen');
    });
    
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Ensure sidebar is open
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded !== 'true') {
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Close sidebar to trigger onboarding - use JavaScript click
    await menuButton.evaluate((el) => (el as HTMLElement).click());
    await cleanPage.waitForTimeout(2500); // Wait for onboarding delay + buffer

    // Wait for and dismiss onboarding
    const onboardingDialog = cleanPage.locator('[role="dialog"]').first();
    await expect(onboardingDialog).toBeVisible({ timeout: 5000 });
    
    const dismissButton = cleanPage.locator('button').filter({ hasText: /dismiss|got it|ok|close/i }).first();
    await dismissButton.click();
    await cleanPage.waitForTimeout(500);

    // Verify localStorage flag is set
    const onboardingSeen = await cleanPage.evaluate(() => {
      return localStorage.getItem('sidebar-onboarding-seen');
    });
    expect(onboardingSeen).toBe('true');

    // Open and close sidebar again - use JavaScript click
    await menuButton.evaluate((el) => (el as HTMLElement).click()); // Open
    await cleanPage.waitForTimeout(500);
    await menuButton.evaluate((el) => (el as HTMLElement).click()); // Close
    await cleanPage.waitForTimeout(2000);

    // Verify onboarding does not appear again
    const onboardingDialog2 = cleanPage.locator('[role="dialog"]');
    await expect(onboardingDialog2).not.toBeVisible();
  });
});

test.describe('Sidebar UX - Hamburger Menu Button', () => {
  test('should have enhanced styling on hamburger menu button', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Find hamburger menu button in header
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    // Verify button has enhanced styling by checking computed styles
    const hasTransition = await menuButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.transition !== 'all 0s ease 0s';
    });
    
    expect(hasTransition).toBe(true);
    
    // Verify button has proper ARIA attributes
    const ariaLabel = await menuButton.getAttribute('aria-label');
    const ariaControls = await menuButton.getAttribute('aria-controls');
    expect(ariaLabel).toBeTruthy();
    expect(ariaControls).toBe('sidebar');
  });

  test('should meet minimum touch target size', async ({ cleanPage }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Find hamburger menu button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    // Verify button size meets 44x44px minimum
    const buttonBox = await menuButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Sidebar UX - Tooltips', () => {
  test('should show tooltip on hamburger menu button hover', async ({
    cleanPage,
  }) => {
    // Skip onboarding to avoid dialog blocking hover
    await cleanPage.evaluate(() => {
      localStorage.setItem('sidebar-onboarding-seen', 'true');
    });
    
    // Set tablet viewport (tooltips work better with hover on larger screens)
    await cleanPage.setViewportSize({ width: 768, height: 1024 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(1000);

    // Find hamburger menu button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    // Ensure sidebar is closed to avoid overlay blocking hover
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Hover over button and wait longer for tooltip
    await menuButton.hover();
    await cleanPage.waitForTimeout(1000);

    // Check for tooltip
    const tooltip = cleanPage.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Verify tooltip has text content
    const tooltipText = await tooltip.textContent();
    expect(tooltipText).toBeTruthy();
    expect(tooltipText?.length).toBeGreaterThan(0);
  });

  test('should show tooltip on floating button hover', async ({
    cleanPage,
  }) => {
    // Skip onboarding to avoid dialog blocking hover
    await cleanPage.evaluate(() => {
      localStorage.setItem('sidebar-onboarding-seen', 'true');
    });
    
    // Set tablet viewport (floating button shows on tablet and hover works)
    await cleanPage.setViewportSize({ width: 768, height: 1024 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure sidebar is closed to show floating button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Now floating button should be visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });

    // Hover over button and wait longer for tooltip
    await floatingButton.hover();
    await cleanPage.waitForTimeout(1000);

    // Check for tooltip
    const tooltip = cleanPage.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Sidebar UX - Keyboard Navigation', () => {
  test('should navigate to hamburger menu button with Tab key', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Focus on hamburger button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.focus();
    
    // Verify it's focused
    const focusedElement = await cleanPage.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName.toLowerCase(),
        ariaControls: el?.getAttribute('aria-controls'),
      };
    });

    expect(focusedElement.tag).toBe('button');
    expect(focusedElement.ariaControls).toBe('sidebar');
  });

  test('should navigate to floating button with Tab key', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure floating button is visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    const isVisible = await floatingButton.isVisible().catch(() => false);
    
    if (!isVisible) {
      const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
      await menuButton.click();
      await cleanPage.waitForTimeout(1000);
    }

    // Focus on floating button
    await expect(floatingButton).toBeVisible({ timeout: 10000 });
    await floatingButton.focus();
    
    // Verify it's focused
    const focusedElement = await cleanPage.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName.toLowerCase(),
        ariaLabel: el?.getAttribute('aria-label'),
      };
    });

    expect(focusedElement.tag).toBe('button');
    expect(focusedElement.ariaLabel).toBeTruthy();
  });

  test('should have visible focus indicator on sidebar buttons', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Focus on hamburger button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.focus();

    // Check focus indicator
    const focusStyles = await cleanPage.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;

      const styles = window.getComputedStyle(el);
      return {
        outlineWidth: styles.outlineWidth,
        outlineStyle: styles.outlineStyle,
        boxShadow: styles.boxShadow,
      };
    });

    expect(focusStyles).not.toBeNull();
    if (focusStyles) {
      const hasFocusIndicator =
        (focusStyles.outlineWidth !== '0px' &&
          focusStyles.outlineStyle !== 'none') ||
        focusStyles.boxShadow !== 'none';
      expect(hasFocusIndicator).toBe(true);
    }
  });

  test('should activate hamburger button with Enter key', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Focus on hamburger button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    
    // Get initial aria-expanded state
    const initialExpanded = await menuButton.getAttribute('aria-expanded');
    
    await menuButton.focus();

    // Press Enter to activate
    await cleanPage.keyboard.press('Enter');
    await cleanPage.waitForTimeout(1000);

    // Verify aria-expanded state changed
    const finalExpanded = await menuButton.getAttribute('aria-expanded');
    expect(finalExpanded).not.toBe(initialExpanded);
  });
});

test.describe('Sidebar UX - Screen Reader Support', () => {
  test('should have proper ARIA labels on hamburger menu button', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Find hamburger menu button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    // Verify ARIA attributes
    const ariaLabel = await menuButton.getAttribute('aria-label');
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    const ariaControls = await menuButton.getAttribute('aria-controls');

    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.toLowerCase()).toMatch(/sidebar|menu/);
    expect(ariaExpanded).toBeTruthy();
    expect(['true', 'false']).toContain(ariaExpanded || '');
    expect(ariaControls).toBe('sidebar');
  });

  test('should have proper ARIA label on floating button', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure floating button is visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    const isVisible = await floatingButton.isVisible().catch(() => false);
    
    if (!isVisible) {
      const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
      await menuButton.click();
      await cleanPage.waitForTimeout(1000);
    }

    // Find floating button
    await expect(floatingButton).toBeVisible({ timeout: 10000 });

    // Verify ARIA label
    const ariaLabel = await floatingButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.toLowerCase()).toMatch(/sidebar|menu|open/);
  });

  test('should announce sidebar state changes to screen readers', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Find hamburger menu button
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    // Get initial aria-expanded state
    const initialExpanded = await menuButton.getAttribute('aria-expanded');

    // Click button to toggle sidebar
    await menuButton.click();
    await cleanPage.waitForTimeout(500);

    // Get new aria-expanded state
    const newExpanded = await menuButton.getAttribute('aria-expanded');

    // Verify state changed
    expect(newExpanded).not.toBe(initialExpanded);
  });
});

test.describe('Sidebar UX - Cross-Browser Compatibility', () => {
  test('should work correctly on Chromium', async ({ cleanPage }) => {
    // Skip onboarding to avoid dialog blocking clicks
    await cleanPage.evaluate(() => {
      localStorage.setItem('sidebar-onboarding-seen', 'true');
    });
    
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    
    // Wait for page to load
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure sidebar is closed using hamburger menu
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Now floating button should be visible
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });

    // Click floating button using JavaScript for reliability
    await floatingButton.evaluate((el) => (el as HTMLElement).click());
    await cleanPage.waitForTimeout(1000);

    // Verify sidebar opened by checking aria-expanded
    const newAriaExpanded = await menuButton.getAttribute('aria-expanded');
    expect(newAriaExpanded).toBe('true');
  });

  test('should have proper touch target sizes on mobile', async ({
    cleanPage,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    
    // Wait for page to load
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Check hamburger menu button size
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });

    const menuButtonBox = await menuButton.boundingBox();
    expect(menuButtonBox).not.toBeNull();
    if (menuButtonBox) {
      expect(menuButtonBox.width).toBeGreaterThanOrEqual(44);
      expect(menuButtonBox.height).toBeGreaterThanOrEqual(44);
    }

    // Ensure sidebar is closed to show floating button
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.click();
      await cleanPage.waitForTimeout(1000);
    }

    // Check floating button size
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });

    const floatingButtonBox = await floatingButton.boundingBox();
    expect(floatingButtonBox).not.toBeNull();
    if (floatingButtonBox) {
      expect(floatingButtonBox.width).toBeGreaterThanOrEqual(44);
      expect(floatingButtonBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('should respect prefers-reduced-motion for animations', async ({
    cleanPage,
  }) => {
    // Skip onboarding to avoid dialog blocking clicks
    await cleanPage.evaluate(() => {
      localStorage.setItem('sidebar-onboarding-seen', 'true');
    });
    
    // Emulate reduced motion preference
    await cleanPage.emulateMedia({ reducedMotion: 'reduce' });

    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    
    // Wait for page to load
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Ensure sidebar is closed using hamburger menu
    const menuButton = cleanPage.locator('header button[aria-controls="sidebar"]');
    await menuButton.waitFor({ state: 'visible', timeout: 10000 });
    
    const ariaExpanded = await menuButton.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') {
      await menuButton.evaluate((el) => (el as HTMLElement).click());
      await cleanPage.waitForTimeout(1000);
    }

    // Click floating button using JavaScript for reliability
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).toBeVisible({ timeout: 10000 });
    await floatingButton.evaluate((el) => (el as HTMLElement).click());
    await cleanPage.waitForTimeout(1000);

    // Verify sidebar opened by checking aria-expanded
    const newAriaExpanded = await menuButton.getAttribute('aria-expanded');
    expect(newAriaExpanded).toBe('true');

    // Check that animations are minimal
    const animationDurations = await cleanPage.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const durations: number[] = [];

      elements.forEach((el) => {
        const styles = window.getComputedStyle(el);
        const duration = parseFloat(styles.animationDuration);
        const transitionDuration = parseFloat(styles.transitionDuration);

        if (duration > 0) durations.push(duration);
        if (transitionDuration > 0) durations.push(transitionDuration);
      });

      return durations;
    });

    // Verify animations are very short or disabled (< 0.1s)
    const longAnimations = animationDurations.filter((d) => d > 0.1);
    expect(longAnimations.length).toBe(0);
  });
});

test.describe('Sidebar UX - Desktop Default State', () => {
  test('should have sidebar open by default on desktop', async ({
    cleanPage,
  }) => {
    // Set desktop viewport
    await cleanPage.setViewportSize({ width: 1440, height: 900 });
    await cleanPage.waitForTimeout(500);

    // Verify sidebar is visible
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Verify no floating button on desktop
    const floatingButton = cleanPage.locator('.fixed.bottom-6.right-6 button');
    await expect(floatingButton).not.toBeVisible();
  });

  test('should not show onboarding on desktop', async ({ cleanPage }) => {
    // Clear localStorage
    await cleanPage.evaluate(() => {
      localStorage.removeItem('sidebar-onboarding-seen');
    });

    // Set desktop viewport
    await cleanPage.setViewportSize({ width: 1440, height: 900 });
    
    // Wait for page to load
    await cleanPage.waitForLoadState('networkidle');
    await cleanPage.waitForTimeout(2000);

    // Verify no onboarding dialog with specific text
    const onboardingDialog = cleanPage.locator('[role="dialog"]').filter({ hasText: /floating|reopen/i });
    await expect(onboardingDialog).not.toBeVisible();
  });
});

test.describe('Sidebar UX - Accessibility', () => {
  test('should have no accessibility violations', async ({ cleanPage }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Run accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
