# Implementation Plan

- [x] 1. Set up test helpers and utilities
  - Create `apps/frontend/src/test/e2e/helpers/` directory structure
  - Implement UIActions class with methods for common UI interactions (createConversation, updateConversationTitle, deleteConversation, searchConversations, clearAllConversations, sendMessage)
  - Implement TestSetup class with methods for test initialization and cleanup (clearStorage, setup)
  - Implement Assertions class with custom assertion helpers (expectConversationInList, expectConversationNotInList, expectSearchResults, expectHighlightedKeyword)
  - Add comprehensive JSDoc documentation for all helper methods
  - Ensure all helpers use data-testid attributes for element selection
  - _Requirements: 5.1-5.5, 9.1-9.5_

- [x] 2. Rewrite cross-tab synchronization tests
  - Create `apps/frontend/src/test/e2e/cross-tab-sync.spec.ts`
  - Implement test: "should propagate title update from tab 1 to tab 2"
  - Implement test: "should propagate conversation deletion from tab 1 to tab 2"
  - Implement test: "should propagate new conversation creation from tab 1 to tab 2"
  - Implement test: "should handle simultaneous updates gracefully"
  - Ensure all tests use UI helpers instead of direct storage access
  - Ensure proper test isolation with beforeEach/afterEach hooks
  - _Requirements: 1.1-1.5, 6.1-6.5_

- [x] 3. Rewrite search functionality tests
  - Create `apps/frontend/src/test/e2e/search-functionality.spec.ts`
  - Implement test: "should search and display all matching conversations"
  - Implement test: "should highlight search keywords in results"
  - Implement test: "should display empty state when no results found"
  - Implement test: "should restore all conversations when search is cleared"
  - Implement test: "should provide pagination when results exceed one page"
  - Ensure all tests use UI helpers for interactions
  - _Requirements: 2.1-2.5, 6.1-6.5_

- [x] 4. Rewrite title persistence tests
  - Create `apps/frontend/src/test/e2e/title-persistence.spec.ts`
  - Implement test: "should persist title after page refresh"
  - Implement test: "should handle very long titles without breaking UI"
  - Implement test: "should persist final title after rapid updates"
  - Ensure all tests use UI helpers for interactions
  - _Requirements: 3.1-3.3, 6.1-6.5_

- [x] 5. Rewrite deletion cleanup tests
  - Create `apps/frontend/src/test/e2e/deletion-cleanup.spec.ts`
  - Implement test: "should remove conversation and messages from UI after deletion"
  - Implement test: "should exclude deleted conversations from search results"
  - Implement test: "should update UI immediately after deletion"
  - Ensure all tests use UI helpers for interactions
  - _Requirements: 4.1-4.3, 6.1-6.5_

- [x] 6. Checkpoint - Ensure all new tests pass
  - Run `cd apps/frontend && pnpm test:e2e` to verify all new tests pass
  - Fix any failing tests before proceeding
  - Ensure tests run reliably and complete within 5 minutes
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.1-8.2, 10.1-10.5_

- [x] 7. Run quality checks
  - Run `cd apps/frontend && pnpm type-check` and fix any TypeScript errors
  - Run `cd apps/frontend && pnpm lint` and fix any ESLint errors/warnings
  - Run `cd apps/frontend && pnpm test --run` and fix any broken unit tests
  - Verify all quality gates pass before proceeding
  - _Requirements: 11.1-11.4_

- [x] 8. Clean up old test files
  - Review and identify obsolete test files (e.g., `cross-tab-sync.playwright.test.ts`, `search-functionality.playwright.test.ts`)
  - Remove old storage-based test files that have been replaced
  - Verify no duplicate functionality exists between old and new tests
  - Update test documentation to reflect new structure
  - _Requirements: 12.1-12.5_

- [x] 9. Organize and consolidate code
  - Review test helpers for any duplicate functionality
  - Consolidate common functionality into reusable modules if needed
  - Ensure test organization follows established patterns in the codebase
  - Clean up any temporary or experimental files
  - Document file structure and conventions
  - _Requirements: 12.1-12.5_

- [x] 10. Final checkpoint - Verify all tests pass
  - Run `cd apps/frontend && pnpm type-check` (expect 0 errors)
  - Run `cd apps/frontend && pnpm lint` (expect 0 errors, 0 warnings)
  - Run `cd apps/frontend && pnpm test --run` (expect all unit tests pass)
  - Run `cd apps/frontend && pnpm test:e2e` (expect all E2E tests pass)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 11.1-11.5_//

- [ ] 11. Commit changes in logical batches
  - Batch 1: `test: add UI-based E2E test helpers` (UIActions, TestSetup, Assertions)
  - Batch 2: `test: rewrite cross-tab sync tests to use UI interactions`
  - Batch 3: `test: rewrite search functionality tests to use UI interactions`
  - Batch 4: `test: rewrite title persistence tests to use UI interactions`
  - Batch 5: `test: rewrite deletion cleanup tests to use UI interactions`
  - Batch 6: `chore: remove old storage-based E2E tests`
  - Batch 7: `docs: update E2E test documentation`
  - Follow conventional commit format for all commits
  - Ensure each commit is atomic and can be reverted independently
  - _Requirements: 13.1-13.5_
