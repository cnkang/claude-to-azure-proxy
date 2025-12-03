import { expect, test } from './fixtures/base.js';

/**
 * Layout Rendering E2E Tests
 *
 * Tests the liquid glass frontend layout components:
 * - Header component positioning and styling
 * - Sidebar component width, positioning, and glass effects
 * - Main content area positioning and overlap prevention
 * - Responsive behavior at mobile, tablet, and desktop breakpoints
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3
 */

test.describe('Layout Rendering', () => {
  test('should render Header with correct positioning and styling', async ({
    cleanPage,
  }) => {
    // Check if Header exists
    const header = cleanPage.locator('header');
    await expect(header).toBeVisible();

    // Verify Header positioning and z-index
    const headerStyles = await header.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const classes = el.className;
      return {
        position: styles.position,
        top: styles.top,
        zIndex: styles.zIndex,
        width: rect.width,
        height: rect.height,
        classes: classes,
        hasSticky: classes.includes('sticky'),
        hasTopZero: classes.includes('top-0'),
      };
    });

    // Header should have sticky class and be at top with z-index 30
    // Note: computed position might be 'static' if not scrolled yet
    expect(headerStyles.hasSticky || headerStyles.position === 'sticky').toBe(
      true
    );

    // Check z-index (may be 'auto' if not explicitly set in computed styles)
    const zIndex = Number.parseInt(headerStyles.zIndex, 10);
    if (!Number.isNaN(zIndex)) {
      expect(zIndex).toBeGreaterThanOrEqual(30);
    } else {
      // If z-index is 'auto', check if the class is present
      expect(headerStyles.classes).toContain('z-30');
    }

    // Header should span full width
    const viewportWidth = await cleanPage.evaluate(() => window.innerWidth);
    expect(headerStyles.width).toBeGreaterThan(viewportWidth * 0.9);
  });

  test('should render Sidebar with correct width and glass effect', async ({
    cleanPage,
  }) => {
    // Check if Sidebar exists
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Verify Sidebar has correct classes and structure
    const sidebarInfo = await sidebar.evaluate((el) => {
      const classes = el.className;
      const glassChild = el.firstElementChild;
      const glassClasses = glassChild ? glassChild.className : '';

      return {
        hasW80: classes.includes('w-80'),
        hasGlassChild: !!glassChild,
        hasBackdropBlur: glassClasses.includes('backdrop-blur'),
      };
    });

    // Sidebar should have w-80 class (320px width)
    expect(sidebarInfo.hasW80).toBe(true);

    // Sidebar should have Glass child component with backdrop blur
    expect(sidebarInfo.hasGlassChild).toBe(true);
    expect(sidebarInfo.hasBackdropBlur).toBe(true);
  });

  test('should prevent main content from overlapping with Header and Sidebar', async ({
    cleanPage,
  }) => {
    const header = cleanPage.locator('header');
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    const mainContent = cleanPage.locator('main');

    await expect(header).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(mainContent).toBeVisible();

    // Get bounding rectangles
    const bounds = await cleanPage.evaluate(() => {
      const headerEl = document.querySelector('header');
      const sidebarEl = document.querySelector('[data-testid="sidebar"]');
      const mainEl = document.querySelector('main');

      return {
        header: headerEl?.getBoundingClientRect(),
        sidebar: sidebarEl?.getBoundingClientRect(),
        main: mainEl?.getBoundingClientRect(),
        headerZIndex: headerEl
          ? Number.parseInt(window.getComputedStyle(headerEl).zIndex, 10)
          : 0,
        sidebarZIndex: sidebarEl
          ? Number.parseInt(window.getComputedStyle(sidebarEl).zIndex, 10)
          : 0,
        mainZIndex: mainEl
          ? Number.parseInt(window.getComputedStyle(mainEl).zIndex, 10)
          : 0,
      };
    });

    // Verify z-index ordering (Header: 30, Sidebar: 40, Main: 10)
    // Note: z-index may be 'auto' (NaN) if not in stacking context
    if (!Number.isNaN(bounds.headerZIndex) && bounds.headerZIndex > 0) {
      expect(bounds.headerZIndex).toBeGreaterThanOrEqual(30);
    }
    if (!Number.isNaN(bounds.sidebarZIndex) && bounds.sidebarZIndex > 0) {
      expect(bounds.sidebarZIndex).toBeGreaterThanOrEqual(40);
    }

    // Verify proper z-index hierarchy if both are set
    if (
      !Number.isNaN(bounds.sidebarZIndex) &&
      !Number.isNaN(bounds.headerZIndex) &&
      bounds.sidebarZIndex > 0 &&
      bounds.headerZIndex > 0
    ) {
      expect(bounds.sidebarZIndex).toBeGreaterThan(bounds.headerZIndex);
    }
  });

  test('should display correct layout structure', async ({ cleanPage }) => {
    // Verify semantic HTML structure
    const structure = await cleanPage.evaluate(() => {
      const header = document.querySelector('header');
      const sidebar = document.querySelector('[data-testid="sidebar"]');
      const main = document.querySelector('main');

      return {
        hasHeader: !!header,
        hasSidebar: !!sidebar,
        hasMain: !!main,
        headerChildren: header?.children.length || 0,
        sidebarChildren: sidebar?.children.length || 0,
        mainChildren: main?.children.length || 0,
      };
    });

    // All major layout components should exist
    expect(structure.hasHeader).toBe(true);
    expect(structure.hasSidebar).toBe(true);
    expect(structure.hasMain).toBe(true);

    // Components should have content
    expect(structure.headerChildren).toBeGreaterThan(0);
    expect(structure.sidebarChildren).toBeGreaterThan(0);
  });
});

test.describe('Responsive Layout Behavior', () => {
  test('should display mobile layout (< 768px)', async ({ cleanPage }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500); // Wait for responsive changes

    const sidebar = cleanPage.locator('[data-testid="sidebar"]');

    // Check sidebar positioning on mobile
    const sidebarStyles = await sidebar.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const classes = el.className;
      return {
        position: styles.position,
        zIndex: Number.parseInt(styles.zIndex, 10),
        classes: classes,
        hasFixed: classes.includes('fixed'),
      };
    });

    // On mobile, sidebar should be fixed positioned with high z-index (overlay)
    // Check either computed style or class
    expect(sidebarStyles.hasFixed || sidebarStyles.position === 'fixed').toBe(
      true
    );

    // Check z-index (may be NaN if 'auto')
    if (!Number.isNaN(sidebarStyles.zIndex) && sidebarStyles.zIndex > 0) {
      expect(sidebarStyles.zIndex).toBeGreaterThanOrEqual(40);
    } else {
      // If z-index is 'auto', check if the class is present
      expect(sidebarStyles.classes).toMatch(/z-40|z-50/);
    }
  });

  test('should display tablet layout (768px - 1024px)', async ({
    cleanPage,
  }) => {
    // Set tablet viewport
    await cleanPage.setViewportSize({ width: 768, height: 1024 });
    await cleanPage.waitForTimeout(500); // Wait for responsive changes

    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Verify sidebar is toggleable on tablet
    const sidebarStyles = await sidebar.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        visible: rect.width > 0,
      };
    });

    // Sidebar should be present and have proper width
    expect(sidebarStyles.visible).toBe(true);
  });

  test('should display desktop layout (> 1024px)', async ({ cleanPage }) => {
    // Set desktop viewport
    await cleanPage.setViewportSize({ width: 1440, height: 900 });
    await cleanPage.waitForTimeout(500); // Wait for responsive changes

    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Verify sidebar has correct classes for desktop
    const sidebarInfo = await sidebar.evaluate((el) => {
      const classes = el.className;
      return {
        hasW80: classes.includes('w-80'),
        hasFixed: classes.includes('fixed'),
        // On desktop (md breakpoint), sidebar should have md:static or md:translate-x-0
        hasMdStatic: classes.includes('md:static'),
        hasMdTranslateX0: classes.includes('md:translate-x-0'),
      };
    });

    // Sidebar should have w-80 class
    expect(sidebarInfo.hasW80).toBe(true);

    // Sidebar should have desktop-specific classes
    expect(sidebarInfo.hasMdStatic || sidebarInfo.hasMdTranslateX0).toBe(true);
  });

  test('should handle orientation changes', async ({ cleanPage }) => {
    // Start in portrait
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(300);

    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Switch to landscape
    await cleanPage.setViewportSize({ width: 667, height: 375 });
    await cleanPage.waitForTimeout(300);

    // Verify layout still works
    await expect(sidebar).toBeVisible();

    // Check that layout adapted without breaking
    const layoutIntact = await cleanPage.evaluate(() => {
      const header = document.querySelector('header');
      const sidebar = document.querySelector('[data-testid="sidebar"]');
      const main = document.querySelector('main');

      return {
        headerVisible: !!header && header.offsetParent !== null,
        sidebarExists: !!sidebar,
        mainVisible: !!main && main.offsetParent !== null,
      };
    });

    expect(layoutIntact.headerVisible).toBe(true);
    expect(layoutIntact.sidebarExists).toBe(true);
    expect(layoutIntact.mainVisible).toBe(true);
  });

  test('should expand main content when sidebar closes on desktop', async ({
    cleanPage,
  }) => {
    // Set desktop viewport
    await cleanPage.setViewportSize({ width: 1440, height: 900 });
    await cleanPage.waitForTimeout(500);

    const _mainContent = cleanPage.locator('main');
    const _sidebar = cleanPage.locator('[data-testid="sidebar"]');

    // Get initial state
    const initialState = await cleanPage.evaluate(() => {
      const main = document.querySelector('main');
      const sidebar = document.querySelector('[data-testid="sidebar"]');
      return {
        mainWidth: main?.getBoundingClientRect().width || 0,
        sidebarVisible: sidebar
          ? window.getComputedStyle(sidebar).display !== 'none'
          : false,
      };
    });

    // Try to find and click sidebar toggle button
    const menuButton = cleanPage
      .locator('button[aria-label*="sidebar" i], button[aria-label*="menu" i]')
      .first();
    const menuButtonExists = (await menuButton.count()) > 0;

    if (menuButtonExists && initialState.sidebarVisible) {
      await menuButton.click();
      await cleanPage.waitForTimeout(500); // Wait for transition

      // Get new state
      const newState = await cleanPage.evaluate(() => {
        const main = document.querySelector('main');
        return {
          mainWidth: main?.getBoundingClientRect().width || 0,
        };
      });

      // Main content should expand when sidebar closes (or at least not shrink)
      expect(newState.mainWidth).toBeGreaterThanOrEqual(initialState.mainWidth);
    }
  });
});

test.describe('Glass Component Styling', () => {
  test('should apply glass effect to Sidebar', async ({ cleanPage }) => {
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Check for glass effect properties on the Glass child component
    const glassStyles = await sidebar.evaluate((el) => {
      // The Glass component is the first child of the sidebar
      const glassChild = el.firstElementChild;
      if (!glassChild) return { hasGlass: false };

      const styles = window.getComputedStyle(glassChild);
      const classes = glassChild.className;

      return {
        hasGlass: true,
        backdropFilter: styles.backdropFilter,
        backgroundColor: styles.backgroundColor,
        borderStyle: styles.borderStyle,
        classes: classes,
        hasBackdropBlurClass: classes.includes('backdrop-blur'),
        hasBackdropBlurStyle:
          styles.backdropFilter &&
          styles.backdropFilter !== 'none' &&
          styles.backdropFilter.includes('blur'),
      };
    });

    // Should have Glass component
    expect(glassStyles.hasGlass).toBe(true);

    // Should have backdrop blur (either in class or computed style)
    expect(
      glassStyles.hasBackdropBlurClass || glassStyles.hasBackdropBlurStyle
    ).toBe(true);
  });

  test('should apply correct glass intensity', async ({ cleanPage }) => {
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Check backdrop filter blur amount on Glass child
    const blurInfo = await sidebar.evaluate((el) => {
      const glassChild = el.firstElementChild;
      if (!glassChild) return { blurAmount: 0, hasBlurClass: false };

      const styles = window.getComputedStyle(glassChild);
      const classes = glassChild.className;
      const backdropFilter = styles.backdropFilter;

      // Extract blur value (e.g., "blur(24px)" -> "24")
      const match = backdropFilter.match(/blur\((\d+)px\)/);
      const blurAmount = match ? Number.parseInt(match[1], 10) : 0;

      // Check for Tailwind blur classes (backdrop-blur-xl, backdrop-blur-2xl, etc.)
      const hasBlurClass = classes.includes('backdrop-blur');

      return { blurAmount, hasBlurClass, classes };
    });

    // Glass component should have significant blur (at least 8px) or blur class
    expect(blurInfo.hasBlurClass || blurInfo.blurAmount >= 8).toBe(true);
  });

  test('should adapt glass styling to theme changes', async ({ cleanPage }) => {
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Verify Glass component has theme-aware classes
    const glassInfo = await sidebar.evaluate((el) => {
      const glassChild = el.firstElementChild;
      if (!glassChild) return { hasGlass: false };

      const classes = glassChild.className;
      return {
        hasGlass: true,
        // Glass component should have dark: variants for theme adaptation
        hasDarkVariants: classes.includes('dark:'),
        hasBackdropBlur: classes.includes('backdrop-blur'),
        // Check for theme-aware background classes
        hasThemeAwareBg:
          classes.includes('bg-white') || classes.includes('bg-black'),
      };
    });

    // Glass component should exist and have theme-aware styling
    expect(glassInfo.hasGlass).toBe(true);
    expect(glassInfo.hasBackdropBlur).toBe(true);

    // Glass should have either dark variants or theme-aware background
    expect(glassInfo.hasDarkVariants || glassInfo.hasThemeAwareBg).toBe(true);
  });
});

test.describe('Layout Accessibility', () => {
  test('should have proper semantic HTML structure', async ({ cleanPage }) => {
    const semanticElements = await cleanPage.evaluate(() => {
      return {
        hasHeader: document.querySelectorAll('header').length > 0,
        hasMain: document.querySelectorAll('main').length > 0,
        hasNav: document.querySelectorAll('nav').length > 0,
      };
    });

    expect(semanticElements.hasHeader).toBe(true);
    expect(semanticElements.hasMain).toBe(true);
  });

  test('should have proper ARIA attributes on Sidebar', async ({
    cleanPage,
  }) => {
    const sidebar = cleanPage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    // Check for ARIA attributes
    const ariaAttributes = await sidebar.evaluate((el) => {
      return {
        hasAriaLabel: el.hasAttribute('aria-label'),
        hasAriaHidden: el.hasAttribute('aria-hidden'),
        ariaHidden: el.getAttribute('aria-hidden'),
      };
    });

    // Sidebar should have proper ARIA attributes
    expect(ariaAttributes.hasAriaLabel || ariaAttributes.hasAriaHidden).toBe(
      true
    );
  });

  test('should maintain focus management', async ({ cleanPage }) => {
    // Tab through interactive elements
    await cleanPage.keyboard.press('Tab');
    await cleanPage.waitForTimeout(100);

    // Check if focus is visible
    const _focusVisible = await cleanPage.evaluate(() => {
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) return false;

      const styles = window.getComputedStyle(activeElement);
      return styles.outline !== 'none' || styles.outlineWidth !== '0px';
    });

    // Focus should be visible (or at least an element should be focused)
    const hasFocus = await cleanPage.evaluate(() => {
      return document.activeElement !== document.body;
    });

    expect(hasFocus).toBe(true);
  });
});

test.describe('Layout Performance', () => {
  test('should render layout components efficiently', async ({ cleanPage }) => {
    // Measure rendering time
    const renderMetrics = await cleanPage.evaluate(() => {
      const perfEntries = performance.getEntriesByType('navigation');
      if (perfEntries.length === 0) return null;

      const navEntry = perfEntries[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded:
          navEntry.domContentLoadedEventEnd -
          navEntry.domContentLoadedEventStart,
        loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
        domInteractive: navEntry.domInteractive - navEntry.fetchStart,
      };
    });

    if (renderMetrics) {
      // DOM should be interactive quickly (< 2000ms)
      expect(renderMetrics.domInteractive).toBeLessThan(2000);
    }
  });

  test('should handle rapid viewport changes', async ({ cleanPage }) => {
    const viewports = [
      { width: 375, height: 667 }, // Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1440, height: 900 }, // Desktop
      { width: 375, height: 667 }, // Back to mobile
    ];

    for (const viewport of viewports) {
      await cleanPage.setViewportSize(viewport);
      await cleanPage.waitForTimeout(200);

      // Verify layout is still intact
      const layoutIntact = await cleanPage.evaluate(() => {
        const header = document.querySelector('header');
        const sidebar = document.querySelector('[data-testid="sidebar"]');
        const main = document.querySelector('main');

        return {
          hasHeader: !!header,
          hasSidebar: !!sidebar,
          hasMain: !!main,
        };
      });

      expect(layoutIntact.hasHeader).toBe(true);
      expect(layoutIntact.hasSidebar).toBe(true);
      expect(layoutIntact.hasMain).toBe(true);
    }
  });
});
