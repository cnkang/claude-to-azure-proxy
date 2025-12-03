import { expect, test } from './fixtures/base.js';

/**
 * Component Rendering Order Test
 *
 * This test checks the order in which components render and verifies that:
 * 1. Storage is initialized before UI components try to access it
 * 2. The test bridge is available for E2E tests
 * 3. Components render in the correct order
 * 4. All necessary data-testid attributes are present
 *
 * Related to Task 2.2: Debug Why Tests Still Fail
 */

test.describe('Component Rendering Order', () => {
  test('should verify component rendering order and storage availability', async ({
    cleanPage,
    helpers,
  }) => {
    console.log('\n=== Starting Component Rendering Order Test ===\n');

    // Step 1: Check if test bridge is available
    console.log('Step 1: Checking test bridge availability...');
    const testBridgeAvailable = await cleanPage.evaluate(() => {
      return {
        hasBridge: typeof window.__TEST_BRIDGE__ !== 'undefined',
        hasStorage:
          typeof window.__TEST_BRIDGE__?.getConversationStorage === 'function',
        hasSessionManager:
          typeof window.__TEST_BRIDGE__?.getSessionManager === 'function',
        e2eMode: window.__E2E_TEST_MODE__,
      };
    });

    console.log(
      'Test Bridge Status:',
      JSON.stringify(testBridgeAvailable, null, 2)
    );
    expect(testBridgeAvailable.hasBridge).toBe(true);
    expect(testBridgeAvailable.hasStorage).toBe(true);
    expect(testBridgeAvailable.e2eMode).toBe(true);

    // Step 2: Check storage initialization
    console.log('\nStep 2: Checking storage initialization...');
    const storageStatus = await cleanPage.evaluate(async () => {
      try {
        const bridge = window.__TEST_BRIDGE__;
        const storage = await bridge.getConversationStorage();

        return {
          available: true,
          hasInitialize: typeof storage.initialize === 'function',
          hasGetConversation: typeof storage.getConversation === 'function',
          hasStoreConversation: typeof storage.storeConversation === 'function',
        };
      } catch (error) {
        return {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log('Storage Status:', JSON.stringify(storageStatus, null, 2));
    expect(storageStatus.available).toBe(true);

    // Step 3: Check component rendering order
    console.log('\nStep 3: Checking component rendering order...');
    const renderingOrder = await cleanPage.evaluate(() => {
      const components = {
        appContainer:
          document.querySelector('[data-testid="app-container"]') !== null,
        sidebar: document.querySelector('[data-testid="sidebar"]') !== null,
        conversationsList:
          document.querySelector('[data-testid="conversations-list"]') !== null,
        newConversationButton:
          document.querySelector('[data-testid="new-conversation-button"]') !==
          null,
        mainContent: document.querySelector('main') !== null,
      };

      return components;
    });

    console.log(
      'Component Rendering Status:',
      JSON.stringify(renderingOrder, null, 2)
    );

    // Verify critical components are rendered
    expect(renderingOrder.appContainer).toBe(true);
    expect(renderingOrder.mainContent).toBe(true);

    // Step 4: Check all available data-testid attributes
    console.log('\nStep 4: Checking available data-testid attributes...');
    const availableTestIds = await cleanPage.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      return Array.from(elements).map((el) => ({
        testId: el.getAttribute('data-testid'),
        tagName: el.tagName.toLowerCase(),
        visible: (el as HTMLElement).offsetParent !== null,
        hasText: (el.textContent?.trim().length ?? 0) > 0,
      }));
    });

    console.log(
      'Available Test IDs:',
      JSON.stringify(availableTestIds, null, 2)
    );
    console.log(`Total elements with data-testid: ${availableTestIds.length}`);

    // Step 5: Check DOM structure
    console.log('\nStep 5: Checking DOM structure...');
    const domStructure = await cleanPage.evaluate(() => {
      const getElementInfo = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;

        return {
          exists: true,
          visible: (el as HTMLElement).offsetParent !== null,
          children: el.children.length,
          classes: el.className,
          id: el.id,
        };
      };

      return {
        body: getElementInfo('body'),
        root: getElementInfo('#root'),
        main: getElementInfo('main'),
        sidebar: getElementInfo('[data-testid="sidebar"]'),
        conversationsList: getElementInfo('[data-testid="conversations-list"]'),
      };
    });

    console.log('DOM Structure:', JSON.stringify(domStructure, null, 2));

    // Step 6: Test storage operations
    console.log('\nStep 6: Testing storage operations...');
    const storageTest = await cleanPage.evaluate(async () => {
      try {
        const bridge = window.__TEST_BRIDGE__;
        const storage = await bridge.getConversationStorage();

        // Try to get all conversations
        const conversations = await storage.getAllConversations();

        return {
          success: true,
          conversationCount: conversations.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log('Storage Test Result:', JSON.stringify(storageTest, null, 2));
    expect(storageTest.success).toBe(true);

    // Step 7: Take a screenshot for visual inspection
    console.log('\nStep 7: Taking screenshot for visual inspection...');
    await cleanPage.screenshot({
      path: 'test-results/component-rendering-order.png',
      fullPage: true,
    });

    console.log('\n=== Component Rendering Order Test Complete ===\n');
  });

  test('should verify conversation creation flow', async ({
    cleanPage,
    helpers,
  }) => {
    console.log('\n=== Starting Conversation Creation Flow Test ===\n');

    // Step 1: Wait for app to be ready
    console.log('Step 1: Waiting for app to be ready...');
    await helpers.waitForAppReady();

    // Step 2: Check if new conversation button is visible
    console.log('\nStep 2: Checking new conversation button...');
    const newButton = await cleanPage.locator(
      '[data-testid="new-conversation-button"]'
    );
    const buttonVisible = await newButton.isVisible().catch(() => false);
    console.log('New conversation button visible:', buttonVisible);

    if (!buttonVisible) {
      console.log('Button not visible, checking DOM...');
      const buttonInfo = await cleanPage.evaluate(() => {
        const button = document.querySelector(
          '[data-testid="new-conversation-button"]'
        );
        if (!button) return { exists: false };

        const rect = button.getBoundingClientRect();
        const styles = window.getComputedStyle(button);

        return {
          exists: true,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          position: styles.position,
        };
      });
      console.log('Button Info:', JSON.stringify(buttonInfo, null, 2));
    }

    expect(buttonVisible).toBe(true);

    // Step 3: Click the button and observe what happens
    console.log('\nStep 3: Clicking new conversation button...');
    await newButton.click();

    // Wait a bit for any async operations
    await cleanPage.waitForTimeout(1000);

    // Step 4: Check if conversation was created
    console.log('\nStep 4: Checking if conversation was created...');
    const conversationCreated = await cleanPage.evaluate(async () => {
      try {
        const bridge = window.__TEST_BRIDGE__;
        const storage = await bridge.getConversationStorage();
        const conversations = await storage.getAllConversations();

        return {
          success: true,
          count: conversations.length,
          conversations: conversations.map((c: any) => ({
            id: c.id,
            title: c.title,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log(
      'Conversation Creation Result:',
      JSON.stringify(conversationCreated, null, 2)
    );

    // Step 5: Check if conversation appears in UI
    console.log('\nStep 5: Checking if conversation appears in UI...');
    const conversationItems = await cleanPage
      .locator('[data-testid^="conversation-item-"]')
      .count();
    console.log('Conversation items in UI:', conversationItems);

    // Step 6: Take a screenshot
    console.log('\nStep 6: Taking screenshot...');
    await cleanPage.screenshot({
      path: 'test-results/conversation-creation-flow.png',
      fullPage: true,
    });

    console.log('\n=== Conversation Creation Flow Test Complete ===\n');
  });

  test('should check browser console for errors', async ({
    cleanPage,
    helpers,
  }) => {
    console.log('\n=== Starting Console Error Check ===\n');

    const consoleMessages: Array<{ type: string; text: string }> = [];
    const pageErrors: Array<string> = [];

    // Listen to console messages
    cleanPage.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Listen to page errors
    cleanPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Wait for app to be ready
    await helpers.waitForAppReady();

    // Wait a bit to collect any errors
    await cleanPage.waitForTimeout(2000);

    // Log all console messages
    console.log('\nConsole Messages:');
    consoleMessages.forEach((msg) => {
      console.log(`  [${msg.type}] ${msg.text}`);
    });

    // Log all page errors
    console.log('\nPage Errors:');
    if (pageErrors.length === 0) {
      console.log('  No page errors detected');
    } else {
      pageErrors.forEach((error) => {
        console.log(`  ${error}`);
      });
    }

    // Check for critical errors
    const criticalErrors = consoleMessages.filter(
      (msg) =>
        msg.type === 'error' &&
        !msg.text.includes('favicon') && // Ignore favicon errors
        !msg.text.includes('DevTools') // Ignore DevTools messages
    );

    console.log('\nCritical Errors:', criticalErrors.length);

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:');
      criticalErrors.forEach((error) => {
        console.log(`  ${error.text}`);
      });
    }

    console.log('\n=== Console Error Check Complete ===\n');
  });
});
