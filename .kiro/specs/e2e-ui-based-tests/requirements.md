# Requirements Document

## Introduction

This specification defines the requirements for rewriting E2E tests to use UI-based interactions instead of direct storage manipulation. The goal is to create more robust, maintainable E2E tests that simulate real user behavior through the UI rather than accessing internal APIs.

## Glossary

- **E2E Tests**: End-to-end tests using Playwright to verify complete user workflows
- **UI-Based Testing**: Testing approach that interacts with the application through the user interface (clicks, typing, etc.) rather than direct API/storage access
- **Cross-Tab Synchronization**: Feature that synchronizes conversation state across multiple browser tabs using localStorage events
- **Storage Layer**: Internal ConversationStorage service that manages data persistence
- **Test Isolation**: Ensuring each test runs independently without affecting other tests
- **Playwright**: Browser automation framework used for E2E testing

## Requirements

### Requirement 1: Rewrite Cross-Tab Synchronization Tests

**User Story:** As a developer, I want E2E tests that verify cross-tab synchronization through UI interactions, so that tests are more maintainable and reflect real user behavior.

#### Acceptance Criteria

1. WHEN testing title updates across tabs THEN the test SHALL create a conversation through the UI in tab 1, update the title through the UI, and verify the title appears in tab 2
2. WHEN testing deletion across tabs THEN the test SHALL delete a conversation through the UI in one tab and verify it disappears from the conversation list in the other tab
3. WHEN testing simultaneous updates THEN the test SHALL update the same conversation in both tabs through the UI and verify conflict resolution works correctly
4. WHEN testing conversation creation THEN the test SHALL create a conversation through the UI in one tab and verify it appears in the conversation list in the other tab
5. WHEN setting up tests THEN the test SHALL clear all conversations through the UI before each test to ensure isolation

### Requirement 2: Rewrite Search Functionality Tests

**User Story:** As a developer, I want E2E tests that verify search functionality through UI interactions, so that tests validate the complete user experience.

#### Acceptance Criteria

1. WHEN testing search with results THEN the test SHALL create conversations through the UI, type in the search box, and verify results appear with keyword highlighting
2. WHEN testing empty search results THEN the test SHALL type a non-matching query in the search box and verify "No results" message appears
3. WHEN testing search in titles and messages THEN the test SHALL create conversations with specific content through the UI and verify search finds matches in both titles and message content
4. WHEN testing case-insensitive search THEN the test SHALL type queries with different cases and verify results match regardless of case
5. WHEN testing pagination THEN the test SHALL create enough conversations to trigger pagination, search for a common term, and verify pagination controls work correctly

### Requirement 3: Rewrite Title Persistence Tests

**User Story:** As a developer, I want E2E tests that verify title persistence through UI interactions, so that tests validate data persists correctly across page reloads.

#### Acceptance Criteria

1. WHEN testing title persistence after refresh THEN the test SHALL create a conversation through the UI, update its title, refresh the page, and verify the title persists
2. WHEN testing very long titles THEN the test SHALL create a conversation through the UI, set a very long title (200+ characters), and verify it displays correctly with proper truncation
3. WHEN verifying persistence THEN the test SHALL use page reload rather than direct storage access to verify data persistence

### Requirement 4: Rewrite Deletion Cleanup Tests

**User Story:** As a developer, I want E2E tests that verify deletion cleanup through UI interactions, so that tests validate complete cleanup of conversation data.

#### Acceptance Criteria

1. WHEN testing deletion cleanup THEN the test SHALL create a conversation through the UI, add messages through the UI, delete the conversation through the UI, and verify it no longer appears in the conversation list
2. WHEN verifying cleanup THEN the test SHALL refresh the page after deletion and verify the conversation does not reappear
3. WHEN testing deletion THEN the test SHALL use the conversation dropdown menu's delete option rather than direct storage access

### Requirement 5: Create UI Test Helpers

**User Story:** As a developer, I want reusable UI test helper functions, so that tests are easier to write and maintain.

#### Acceptance Criteria

1. WHEN creating a conversation through UI THEN the helper SHALL click "New Conversation" button and wait for the conversation to appear in the list
2. WHEN updating a conversation title THEN the helper SHALL click on the title, type the new title, and press Enter
3. WHEN deleting a conversation THEN the helper SHALL click the dropdown menu, click delete, and confirm the deletion
4. WHEN searching for conversations THEN the helper SHALL type in the search box and wait for results to appear
5. WHEN clearing all conversations THEN the helper SHALL iterate through the conversation list and delete each conversation through the UI

### Requirement 6: Ensure Test Isolation

**User Story:** As a developer, I want each E2E test to run independently, so that test failures are easier to debug and tests don't affect each other.

#### Acceptance Criteria

1. WHEN starting each test THEN the test SHALL clear localStorage and IndexedDB through browser APIs
2. WHEN starting each test THEN the test SHALL clear all conversations through the UI to ensure a clean state
3. WHEN tests run in sequence THEN each test SHALL start with an empty conversation list
4. WHEN tests fail THEN the failure SHALL not affect subsequent tests
5. WHEN cleaning up after tests THEN the test SHALL close all browser contexts properly

### Requirement 7: Improve Test Reliability

**User Story:** As a developer, I want E2E tests that are reliable and don't have flaky failures, so that CI/CD pipelines are trustworthy.

#### Acceptance Criteria

1. WHEN waiting for UI elements THEN the test SHALL use Playwright's built-in waiting mechanisms (waitForSelector, waitForLoadState)
2. WHEN verifying cross-tab synchronization THEN the test SHALL wait for storage events to propagate with appropriate timeouts
3. WHEN interacting with elements THEN the test SHALL wait for elements to be visible and enabled before clicking
4. WHEN verifying results THEN the test SHALL use explicit assertions with clear error messages
5. WHEN tests timeout THEN the timeout SHALL be set to a reasonable value (30 seconds) with clear timeout messages

### Requirement 8: Maintain Test Coverage

**User Story:** As a developer, I want E2E tests to maintain the same coverage as before, so that we don't lose test coverage during the rewrite.

#### Acceptance Criteria

1. WHEN rewriting tests THEN all 12 existing E2E test scenarios SHALL be covered
2. WHEN tests run THEN they SHALL verify the same functionality as the original tests
3. WHEN tests pass THEN they SHALL provide confidence that the application works correctly
4. WHEN comparing coverage THEN the new tests SHALL cover at least the same user workflows as the original tests
5. WHEN tests are complete THEN all tests SHALL pass on Chromium browser

### Requirement 9: Document Test Patterns

**User Story:** As a developer, I want clear documentation of E2E test patterns, so that future tests follow the same approach.

#### Acceptance Criteria

1. WHEN writing new tests THEN developers SHALL have access to documented UI test helper patterns
2. WHEN creating test helpers THEN the helpers SHALL be documented with JSDoc comments
3. WHEN tests use common patterns THEN the patterns SHALL be extracted into reusable helpers
4. WHEN tests need to wait for async operations THEN the waiting patterns SHALL be documented
5. WHEN tests need to verify UI state THEN the assertion patterns SHALL be documented

### Requirement 10: Ensure Tests Run in CI/CD

**User Story:** As a developer, I want E2E tests to run reliably in CI/CD pipelines, so that we catch regressions before deployment.

#### Acceptance Criteria

1. WHEN tests run in CI THEN they SHALL use the Playwright webServer configuration to start the dev server automatically
2. WHEN tests run in CI THEN they SHALL wait for the server to be ready before starting tests
3. WHEN tests run in CI THEN they SHALL produce clear error messages and screenshots on failure
4. WHEN tests run in CI THEN they SHALL complete within a reasonable time (5 minutes total)
5. WHEN tests fail in CI THEN they SHALL provide trace files for debugging

### Requirement 11: Ensure Code Quality and Type Safety

**User Story:** As a developer, I want all code changes to pass quality checks, so that the codebase remains maintainable and error-free.

#### Acceptance Criteria

1. WHEN implementation is complete THEN running pnpm type-check SHALL report zero TypeScript errors
2. WHEN implementation is complete THEN running pnpm lint SHALL report zero ESLint errors and zero warnings
3. WHEN implementation is complete THEN running pnpm test --run SHALL pass all unit tests with zero errors and zero warnings
4. WHEN implementation is complete THEN running pnpm test:e2e SHALL pass all E2E tests with zero failures
5. WHEN quality checks fail THEN the issues SHALL be fixed before proceeding to file organization

### Requirement 12: Organize and Clean Up Test Files

**User Story:** As a developer, I want test files to be properly organized and unnecessary files removed, so that the test suite is maintainable.

#### Acceptance Criteria

1. WHEN new test files are created THEN they SHALL follow the naming convention: `[feature].spec.ts` for E2E tests
2. WHEN old test files exist THEN they SHALL be evaluated for removal or consolidation with new tests
3. WHEN test helpers are created THEN they SHALL be placed in `tests/e2e/helpers/` directory
4. WHEN duplicate test utilities exist THEN they SHALL be consolidated into shared helpers
5. WHEN test files are no longer needed THEN they SHALL be removed to reduce maintenance burden

### Requirement 13: Create Meaningful Commits

**User Story:** As a developer, I want changes committed in logical batches with clear messages, so that the git history is understandable.

#### Acceptance Criteria

1. WHEN committing changes THEN commits SHALL follow conventional commit format (test/refactor/chore)
2. WHEN organizing commits THEN related changes SHALL be grouped in the same commit
3. WHEN writing commit messages THEN each message SHALL clearly describe what changed and why
4. WHEN multiple types of changes exist THEN they SHALL be split into separate commits (e.g., test helpers separate from test rewrites)
5. WHEN commits are complete THEN the commit history SHALL follow industry best practices for clarity and atomicity
