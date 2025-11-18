import { test, expect } from './fixtures/base.js';

/**
 * Diagnostic Test for Search Component
 * 
 * Check if search component appears after creating conversations
 */

test.describe('Search Component Diagnostic', () => {
  test('should show search component after creating conversations', async ({ cleanPage, helpers }) => {
    await helpers.waitForAppReady();
    
    // Create a conversation by clicking the button
    const newButton = cleanPage.locator('[data-testid="new-conversation-button"]');
    await newButton.click();
    
    // Wait for conversation to be created
    await cleanPage.waitForTimeout(2000);
    
    // Check if search component appears
    const searchInput = await cleanPage.locator('[data-testid="search-input"]').count();
    console.log('Search input count after creating conversation:', searchInput);
    
    // Check for search section
    const searchSection = await cleanPage.locator('.conversations-search-section').count();
    console.log('Search section count:', searchSection);
    
    // Take a screenshot
    await cleanPage.screenshot({ path: 'diagnostic-search-after-conversation.png' });
    
    // Get all visible elements with "search" in class or id
    const searchElements = await cleanPage.evaluate(() => {
      const all = document.querySelectorAll('*');
      const searchRelated: string[] = [];
      all.forEach(el => {
        const className = el.className?.toString() || '';
        const id = el.id || '';
        if (className.includes('search') || id.includes('search')) {
          searchRelated.push(`${el.tagName}.${className}#${id}`);
        }
      });
      return searchRelated;
    });
    
    console.log('Search-related elements:', searchElements);
    
    if (searchInput > 0) {
      console.log('✅ Search component is visible!');
    } else {
      console.log('❌ Search component is NOT visible');
      console.log('This means the search component was not added to the Sidebar or needs a page reload');
    }
  });
});
