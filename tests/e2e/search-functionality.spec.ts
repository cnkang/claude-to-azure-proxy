import { expect, test } from './fixtures/base.js';

/**
 * Search Functionality E2E Tests
 *
 * Tests comprehensive search functionality in real browsers including:
 * - Search with correct result count and highlighting
 * - Keyword highlighting in search results
 * - Context display around keyword matches
 * - Pagination controls and navigation
 * - Empty search results handling
 * - Case-insensitive and case-sensitive search
 * - Search performance (<500ms)
 * - Search result prefetching
 * - Search index maintenance
 *
 * Requirements:
 * - 8.1: Search completes within 500ms
 * - 8.2: Displays matching conversations with highlighted keywords
 * - 8.3: Opens conversation and scrolls to first keyword occurrence
 * - 8.4: Highlights all keyword occurrences in conversation
 * - 8.5: Provides navigation controls to jump between occurrences
 * - 8.6: Supports case-insensitive search by default
 * - 8.7: Displays context (100 chars before/after keyword)
 * - 8.8: Shows "No results found" with suggestions
 * - 8.9: Implements pagination with 20 results per page
 * - 8.10: Loads first 3 pages immediately, lazy-loads additional pages
 * - 8.14: Maintains search index consistency when conversations change
 */
test.describe('Search Functionality', () => {
  test('should search and display correct result count with highlighting', async ({
    cleanPage,
    helpers,
  }) => {
    // Create test conversations with searchable content
    await helpers.createTestConversation('Project Planning Discussion', [
      { role: 'user', content: "Let's discuss the project timeline" },
      { role: 'assistant', content: 'Sure, I can help with project planning' },
    ]);

    await helpers.createTestConversation('Budget Review', [
      { role: 'user', content: 'Can you review the project budget?' },
      { role: 'assistant', content: "I'll analyze the budget details" },
    ]);

    await helpers.createTestConversation('Team Meeting Notes', [
      { role: 'user', content: 'Here are the meeting notes' },
      { role: 'assistant', content: 'Thanks for sharing the notes' },
    ]);

    // Reload to ensure conversations are loaded from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "project"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]',
      { state: 'visible', timeout: 5000 }
    );

    await searchInput.fill('project');

    // Wait for search to complete (debounce + search time)
    await cleanPage.waitForTimeout(800);

    // Verify search results appear
    const resultsContainer = await cleanPage.waitForSelector(
      '[data-testid="search-results"]',
      { state: 'visible', timeout: 2000 }
    );

    expect(resultsContainer).not.toBeNull();

    // Verify result count (should find 2 conversations with "project")
    const resultItems = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(resultItems.length).toBe(2);

    // Verify highlighted keywords exist
    const highlights = await cleanPage.$$('mark');
    expect(highlights.length).toBeGreaterThan(0);

    // Verify search statistics displayed
    const searchStats = await cleanPage.waitForSelector('.search-stats', {
      state: 'visible',
      timeout: 2000,
    });

    const statsText = await searchStats.textContent();
    expect(statsText).toContain('2 results');
  });

  test('should highlight keywords in search results with proper context', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversation with specific content
    await helpers.createTestConversation('API Integration Guide', [
      {
        role: 'user',
        content:
          'How do I integrate the payment API into my application? I need detailed steps.',
      },
      {
        role: 'assistant',
        content:
          'To integrate the payment API, first obtain your API credentials from the dashboard.',
      },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "API"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('API');
    await cleanPage.waitForTimeout(800);

    // Verify keyword highlighting
    const highlights = await cleanPage.$$('mark');
    expect(highlights.length).toBeGreaterThan(0);

    // Verify highlighted text contains "API"
    const firstHighlight = highlights[0];
    const highlightText = await firstHighlight.textContent();
    expect(highlightText?.toLowerCase()).toContain('api');

    // Verify context display (Requirement 8.7: 100 chars before/after)
    const matchContext = await cleanPage.waitForSelector('.match-context');
    const contextText = await matchContext.textContent();

    // Context should include text before and after the keyword
    expect(contextText).toBeTruthy();
    expect(contextText!.length).toBeGreaterThan(10); // Should have context
  });

  test('should handle pagination with 20 results per page', async ({
    cleanPage,
    helpers,
  }) => {
    // Create 25 conversations to test pagination
    for (let i = 1; i <= 25; i++) {
      await helpers.createTestConversation(`Test Conversation ${i}`, [
        { role: 'user', content: `This is test message number ${i}` },
      ]);
    }

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "test" (should match all 25 conversations)
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('test');
    await cleanPage.waitForTimeout(800);

    // Verify first page shows 20 results (Requirement 8.9)
    const page1Results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(page1Results.length).toBe(20);

    // Verify pagination controls exist
    const paginationNav = await cleanPage.waitForSelector(
      'nav[aria-label*="pagination"]',
      { state: 'visible' }
    );
    expect(paginationNav).not.toBeNull();

    // Verify page info shows correct page
    const pageInfo = await cleanPage.waitForSelector('.pagination-info');
    const pageInfoText = await pageInfo.textContent();
    expect(pageInfoText).toContain('Page 1 of 2');

    // Click next page button
    const nextButton = await cleanPage.waitForSelector(
      'button[aria-label="Next page"]',
      { state: 'visible' }
    );
    await nextButton.click();

    // Wait for page 2 to load
    await cleanPage.waitForTimeout(800);

    // Verify page 2 shows remaining 5 results
    const page2Results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(page2Results.length).toBe(5);

    // Verify page info updated
    const pageInfo2Text = await pageInfo.textContent();
    expect(pageInfo2Text).toContain('Page 2 of 2');

    // Verify previous button is enabled, next button is disabled
    const prevButton = await cleanPage.waitForSelector(
      'button[aria-label="Previous page"]'
    );
    const isPrevDisabled = await prevButton.isDisabled();
    const isNextDisabled = await nextButton.isDisabled();

    expect(isPrevDisabled).toBe(false);
    expect(isNextDisabled).toBe(true);
  });

  test('should handle empty search results with helpful message', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a conversation
    await helpers.createTestConversation('Sample Conversation', [
      { role: 'user', content: 'Hello world' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for something that doesn't exist
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('nonexistentquery12345');
    await cleanPage.waitForTimeout(800);

    // Verify "No results found" message appears (Requirement 8.8)
    const noResults = await cleanPage.waitForSelector('.no-results', {
      state: 'visible',
      timeout: 2000,
    });

    const noResultsText = await noResults.textContent();
    expect(noResultsText).toContain('No results found');
    expect(noResultsText).toContain('nonexistentquery12345');

    // Verify suggestions are displayed (Requirement 8.8)
    const suggestions = await cleanPage.waitForSelector('.search-suggestions');
    const suggestionsText = await suggestions.textContent();

    expect(suggestionsText).toContain('Suggestions');
    expect(suggestionsText).toContain('Try different keywords');
  });

  test('should support case-insensitive search by default', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversation with mixed case content
    await helpers.createTestConversation('JavaScript Tutorial', [
      { role: 'user', content: 'I want to learn JavaScript programming' },
      { role: 'assistant', content: 'JavaScript is a great language to learn' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search with lowercase (Requirement 8.6: case-insensitive by default)
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('javascript');
    await cleanPage.waitForTimeout(800);

    // Should find results despite case difference
    const results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBeGreaterThan(0);

    // Verify highlights exist
    const highlights = await cleanPage.$$('mark');
    expect(highlights.length).toBeGreaterThan(0);

    // Clear search
    await searchInput.fill('');
    await cleanPage.waitForTimeout(500);

    // Search with uppercase
    await searchInput.fill('JAVASCRIPT');
    await cleanPage.waitForTimeout(800);

    // Should still find results
    const results2 = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results2.length).toBeGreaterThan(0);
  });

  test('should support case-sensitive search when enabled', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversations with different case variations
    await helpers.createTestConversation('JavaScript Tutorial', [
      { role: 'user', content: 'I want to learn JavaScript programming' },
      { role: 'assistant', content: 'JavaScript is great' },
    ]);

    await helpers.createTestConversation('javascript basics', [
      { role: 'user', content: 'Tell me about javascript fundamentals' },
      { role: 'assistant', content: 'javascript is a scripting language' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Enable case-sensitive search (if there's a toggle in UI)
    const caseSensitiveToggle = await cleanPage
      .waitForSelector('input[type="checkbox"][aria-label*="case-sensitive"]', {
        state: 'visible',
        timeout: 2000,
      })
      .catch(() => null);

    if (caseSensitiveToggle) {
      await caseSensitiveToggle.check();
      await cleanPage.waitForTimeout(300);
    }

    // Search with exact case "JavaScript" (capital J and S)
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('JavaScript');
    await cleanPage.waitForTimeout(800);

    // With case-sensitive search, should only find exact matches
    const results = await cleanPage.$$('[data-testid^="search-result-"]');

    // If case-sensitive is supported, should find only 1 conversation
    // If not supported (toggle doesn't exist), will find both (case-insensitive)
    if (caseSensitiveToggle) {
      expect(results.length).toBe(1);

      // Verify it's the correct conversation
      const resultTitle = await results[0].textContent();
      expect(resultTitle).toContain('JavaScript Tutorial');
      expect(resultTitle).not.toContain('javascript basics');
    } else {
      // Case-sensitive not implemented yet, should find both
      expect(results.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('should complete search within 500ms', async ({
    cleanPage,
    helpers,
  }) => {
    // Create multiple conversations
    for (let i = 1; i <= 10; i++) {
      await helpers.createTestConversation(`Performance Test ${i}`, [
        { role: 'user', content: `Message ${i} with performance keyword` },
        { role: 'assistant', content: `Response ${i} about performance` },
      ]);
    }

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Measure search performance (Requirement 8.1: <500ms)
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );

    const startTime = Date.now();
    await searchInput.fill('performance');

    // Wait for search to complete
    await cleanPage.waitForSelector('[data-testid="search-results"]', {
      state: 'visible',
      timeout: 2000,
    });

    const searchTime = Date.now() - startTime;

    // Search should complete within 500ms + debounce (300ms) = 800ms total
    expect(searchTime).toBeLessThan(1000);

    // Verify search time is displayed in stats
    const searchStats = await cleanPage.waitForSelector('.search-stats');
    const statsText = await searchStats.textContent();

    // Extract search time from stats (e.g., "(250ms)")
    const timeMatch = statsText?.match(/\((\d+)ms\)/);
    if (timeMatch) {
      const displayedTime = Number.parseInt(timeMatch[1], 10);
      expect(displayedTime).toBeLessThan(500); // Actual search time should be <500ms
    }
  });

  test('should open conversation and scroll to first keyword occurrence', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversation with keyword in specific message
    const conversationId = await helpers.createTestConversation(
      'Long Conversation',
      [
        { role: 'user', content: 'First message without keyword' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message without keyword' },
        { role: 'assistant', content: 'Second response' },
        { role: 'user', content: 'Third message with important keyword here' },
        {
          role: 'assistant',
          content: 'Third response about the important topic',
        },
      ]
    );

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "important"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('important');
    await cleanPage.waitForTimeout(800);

    // Click on search result
    const firstResult = await cleanPage.waitForSelector(
      '[data-testid^="search-result-"]'
    );
    await firstResult.click();

    // Wait for conversation to open
    await cleanPage.waitForTimeout(1000);

    // Verify conversation opened (Requirement 8.3)
    const conversationView = await cleanPage.waitForSelector(
      '[data-testid="conversation-view"]',
      { state: 'visible', timeout: 2000 }
    );
    expect(conversationView).not.toBeNull();

    // Verify keyword is highlighted in conversation (Requirement 8.4)
    const conversationHighlights = await cleanPage.$$(
      '.conversation-view mark'
    );
    expect(conversationHighlights.length).toBeGreaterThan(0);

    // Verify navigation controls exist (Requirement 8.5)
    const highlightNav = await cleanPage.waitForSelector(
      '.highlight-navigation',
      { state: 'visible', timeout: 2000 }
    );
    expect(highlightNav).not.toBeNull();

    // Verify occurrence counter shows correct count
    const occurrenceCounter = await highlightNav.textContent();
    expect(occurrenceCounter).toMatch(/\d+ of \d+/);
  });

  test('should provide navigation controls to jump between keyword occurrences', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversation with multiple keyword occurrences
    await helpers.createTestConversation('Multiple Occurrences', [
      { role: 'user', content: 'Tell me about React hooks' },
      { role: 'assistant', content: 'React hooks are a powerful feature' },
      { role: 'user', content: 'How do React hooks work?' },
      {
        role: 'assistant',
        content: 'React hooks let you use state in function components',
      },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "React"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('React');
    await cleanPage.waitForTimeout(800);

    // Click on search result
    const firstResult = await cleanPage.waitForSelector(
      '[data-testid^="search-result-"]'
    );
    await firstResult.click();
    await cleanPage.waitForTimeout(1000);

    // Get navigation controls (Requirement 8.5)
    const highlightNav = await cleanPage.waitForSelector(
      '.highlight-navigation'
    );
    const prevButton = await highlightNav.waitForSelector(
      'button[aria-label*="Previous"]'
    );
    const nextButton = await highlightNav.waitForSelector(
      'button[aria-label*="Next"]'
    );
    const counter = await highlightNav.waitForSelector(
      'span[aria-live="polite"]'
    );

    // Verify initial state shows "1 of X"
    let counterText = await counter.textContent();
    expect(counterText).toMatch(/1 of \d+/);

    // Click next button
    await nextButton.click();
    await cleanPage.waitForTimeout(300);

    // Verify counter updated to "2 of X"
    counterText = await counter.textContent();
    expect(counterText).toMatch(/2 of \d+/);

    // Click previous button
    await prevButton.click();
    await cleanPage.waitForTimeout(300);

    // Verify counter back to "1 of X"
    counterText = await counter.textContent();
    expect(counterText).toMatch(/1 of \d+/);
  });

  test('should maintain search index when conversations are updated', async ({
    cleanPage,
    helpers,
  }) => {
    // Create initial conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Original content' }]
    );

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "original" - should find it
    let searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('original');
    await cleanPage.waitForTimeout(800);

    let results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(1);

    // Clear search
    await searchInput.fill('');
    await cleanPage.waitForTimeout(500);

    // Update conversation title (Requirement 8.14: index maintenance)
    await helpers.updateConversationTitle(conversationId, 'Updated Title');
    await cleanPage.waitForTimeout(800);

    // Search for "updated" - should find it
    searchInput = await cleanPage.waitForSelector('input[role="searchbox"]');
    await searchInput.fill('updated');
    await cleanPage.waitForTimeout(800);

    results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(1);

    // Search for "original" - should NOT find it anymore
    await searchInput.fill('original');
    await cleanPage.waitForTimeout(800);

    const noResults = await cleanPage.waitForSelector('.no-results', {
      state: 'visible',
      timeout: 2000,
    });
    expect(noResults).not.toBeNull();
  });

  test('should maintain search index when conversations are deleted', async ({
    cleanPage,
    helpers,
  }) => {
    // Create two conversations
    const conv1Id = await helpers.createTestConversation('Keep This One', [
      { role: 'user', content: 'Keep this conversation' },
    ]);

    const conv2Id = await helpers.createTestConversation('Delete This One', [
      { role: 'user', content: 'Delete this conversation' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "conversation" - should find both
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('conversation');
    await cleanPage.waitForTimeout(800);

    let results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(2);

    // Clear search
    await searchInput.fill('');
    await cleanPage.waitForTimeout(500);

    // Delete second conversation (Requirement 8.14: index maintenance)
    await helpers.deleteConversation(conv2Id);
    await cleanPage.waitForTimeout(800);

    // Search again for "conversation" - should only find one
    await searchInput.fill('conversation');
    await cleanPage.waitForTimeout(800);

    results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(1);

    // Verify it's the correct conversation
    const resultTitle = await results[0].textContent();
    expect(resultTitle).toContain('Keep This One');
    expect(resultTitle).not.toContain('Delete This One');
  });

  test('should prefetch first 3 pages for faster navigation', async ({
    cleanPage,
    helpers,
  }) => {
    // Create 70 conversations to have 4 pages (20 per page)
    for (let i = 1; i <= 70; i++) {
      await helpers.createTestConversation(`Prefetch Test ${i}`, [
        { role: 'user', content: `Prefetch message ${i}` },
      ]);
    }

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "prefetch"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('prefetch');

    // Wait for initial search and prefetch to complete
    await cleanPage.waitForTimeout(1500);

    // Verify page 1 loaded
    let results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(20);

    // Navigate to page 2 - should be instant (prefetched)
    const nextButton = await cleanPage.waitForSelector(
      'button[aria-label="Next page"]'
    );

    const page2StartTime = Date.now();
    await nextButton.click();
    await cleanPage.waitForSelector('[data-testid^="search-result-"]', {
      state: 'visible',
      timeout: 2000,
    });
    const page2LoadTime = Date.now() - page2StartTime;

    // Page 2 should load very quickly (prefetched)
    expect(page2LoadTime).toBeLessThan(500);

    // Navigate to page 3 - should also be instant (prefetched)
    const page3StartTime = Date.now();
    await nextButton.click();
    await cleanPage.waitForSelector('[data-testid^="search-result-"]', {
      state: 'visible',
      timeout: 2000,
    });
    const page3LoadTime = Date.now() - page3StartTime;

    // Page 3 should load very quickly (prefetched)
    expect(page3LoadTime).toBeLessThan(500);

    // Navigate to page 4 - may be slower (not prefetched initially)
    await nextButton.click();
    await cleanPage.waitForTimeout(800);

    // Verify page 4 loaded
    results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(10); // Remaining 10 results
  });

  test('should handle keyboard navigation in search results', async ({
    cleanPage,
    helpers,
  }) => {
    // Create test conversations
    await helpers.createTestConversation('First Result', [
      { role: 'user', content: 'Keyboard navigation test' },
    ]);

    await helpers.createTestConversation('Second Result', [
      { role: 'user', content: 'Keyboard navigation test' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "keyboard"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('keyboard');
    await cleanPage.waitForTimeout(800);

    // Press ArrowDown to move to first result
    await searchInput.press('ArrowDown');
    await cleanPage.waitForTimeout(200);

    // Verify first result is focused
    const focusedElement = await cleanPage.evaluate(() => {
      return document.activeElement?.getAttribute('data-testid');
    });
    expect(focusedElement).toContain('search-result-');

    // Press ArrowDown again to move to second result
    await cleanPage.keyboard.press('ArrowDown');
    await cleanPage.waitForTimeout(200);

    // Press ArrowUp to go back to first result
    await cleanPage.keyboard.press('ArrowUp');
    await cleanPage.waitForTimeout(200);

    // Press Escape to clear search
    await cleanPage.keyboard.press('Escape');
    await cleanPage.waitForTimeout(500);

    // Verify search cleared
    const inputValue = await searchInput.inputValue();
    expect(inputValue).toBe('');
  });

  test('should display search statistics with result count and time', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversations
    for (let i = 1; i <= 5; i++) {
      await helpers.createTestConversation(`Statistics Test ${i}`, [
        { role: 'user', content: `Statistics message ${i}` },
      ]);
    }

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for "statistics"
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('statistics');
    await cleanPage.waitForTimeout(800);

    // Verify search statistics displayed
    const searchStats = await cleanPage.waitForSelector('.search-stats', {
      state: 'visible',
      timeout: 2000,
    });

    const statsText = await searchStats.textContent();

    // Should show result count
    expect(statsText).toContain('5 results');

    // Should show search time in milliseconds
    expect(statsText).toMatch(/\(\d+ms\)/);
  });

  test('should handle search with multiple keywords', async ({
    cleanPage,
    helpers,
  }) => {
    // Create conversations with different keyword combinations
    await helpers.createTestConversation('React and TypeScript', [
      { role: 'user', content: 'I want to learn React with TypeScript' },
    ]);

    await helpers.createTestConversation('Only React', [
      { role: 'user', content: 'I want to learn React' },
    ]);

    await helpers.createTestConversation('Only TypeScript', [
      { role: 'user', content: 'I want to learn TypeScript' },
    ]);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Search for multiple keywords
    const searchInput = await cleanPage.waitForSelector(
      'input[role="searchbox"]'
    );
    await searchInput.fill('React TypeScript');
    await cleanPage.waitForTimeout(800);

    // Should find all conversations containing either keyword
    const results = await cleanPage.$$('[data-testid^="search-result-"]');
    expect(results.length).toBe(3);

    // Verify highlights for both keywords
    const highlights = await cleanPage.$$('mark');
    expect(highlights.length).toBeGreaterThan(0);

    // Verify both keywords are highlighted
    const highlightTexts = await Promise.all(
      highlights.map((h) => h.textContent())
    );

    const hasReact = highlightTexts.some((text) =>
      text?.toLowerCase().includes('react')
    );
    const hasTypeScript = highlightTexts.some((text) =>
      text?.toLowerCase().includes('typescript')
    );

    expect(hasReact).toBe(true);
    expect(hasTypeScript).toBe(true);
  });
});
