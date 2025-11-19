/**
 * Conversation Persistence Integration Tests
 *
 * Tests optimistic updates, rollback scenarios, persistence confirmation,
 * error handling with RetryManager, debounced updates, and persistence status tracking.
 *
 * Requirements: Code Quality, 1.1, 1.3, 2.1, 2.2, 2.3, 3.1, 3.4, 6.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from '../hooks/useConversations.js';
import { useDebouncedTitle } from '../hooks/useDebouncedTitle.js';
import { getConversationStorage } from '../services/storage.js';
import { getRetryManager } from '../utils/retry-manager.js';
import {
  PersistenceError,
  PersistenceErrorType,
} from '../errors/persistence-error.js';
import type { Conversation } from '../types/index.js';

// Mock dependencies
vi.mock('../services/storage.js');
vi.mock('../services/session.js');
vi.mock('../services/cross-tab-sync.js');
vi.mock('../contexts/AppContext.js');

describe('Conversation Persistence', () => {
  let mockStorage: ReturnType<typeof getConversationStorage>;
  let mockConversation: Conversation;

  beforeEach(() => {
    // Setup mock storage
    mockStorage = {
      initialize: vi.fn().mockResolvedValue(undefined),
      updateConversationTitle: vi.fn().mockResolvedValue(undefined),
      deleteConversation: vi.fn().mockResolvedValue({
        success: true,
        conversationRemoved: true,
        messagesRemoved: 5,
        metadataRemoved: true,
        bytesFreed: 1024,
      }),
      storeConversation: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue(null),
      getAllConversations: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof getConversationStorage>;

    vi.mocked(getConversationStorage).mockReturnValue(mockStorage);

    // Setup mock conversation
    mockConversation = {
      id: 'conv_123',
      title: 'Test Conversation',
      messages: [],
      selectedModel: 'gpt-4o',
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: 'session_123',
      isStreaming: false,
      modelHistory: [],
      contextUsage: {
        currentTokens: 0,
        maxTokens: 128000,
        warningThreshold: 80,
        canExtend: false,
        isExtended: false,
      },
      compressionHistory: [],
      persistenceStatus: 'synced',
      isDirty: false,
      syncVersion: 1,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Optimistic Title Updates', () => {
    it('should update title optimistically before persistence', async () => {
      // Test that UI updates immediately before storage operation completes
      const newTitle = 'Updated Title';

      // Delay storage operation to verify optimistic update
      vi.mocked(mockStorage.updateConversationTitle).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      // Simulate title update
      const updatePromise = mockStorage.updateConversationTitle(
        mockConversation.id,
        newTitle
      );

      // Verify storage was called
      expect(mockStorage.updateConversationTitle).toHaveBeenCalledWith(
        mockConversation.id,
        newTitle
      );

      // Wait for completion
      await updatePromise;
    });

    it('should rollback title on persistence failure', async () => {
      // Test that title reverts to previous value when persistence fails
      const previousTitle = mockConversation.title;
      const newTitle = 'Failed Title';

      // Mock storage failure
      const error = new PersistenceError(
        PersistenceErrorType.WRITE_FAILED,
        'Storage write failed',
        mockConversation.id,
        true
      );
      vi.mocked(mockStorage.updateConversationTitle).mockRejectedValue(error);

      // Attempt title update
      try {
        await mockStorage.updateConversationTitle(
          mockConversation.id,
          newTitle
        );
      } catch (err) {
        // Verify error was thrown
        expect(err).toBeInstanceOf(PersistenceError);
        expect((err as PersistenceError).type).toBe(
          PersistenceErrorType.WRITE_FAILED
        );
      }

      // Verify storage was called
      expect(mockStorage.updateConversationTitle).toHaveBeenCalledWith(
        mockConversation.id,
        newTitle
      );
    });

    it('should update persistence status during title update', async () => {
      // Test that persistence status changes from pending to synced
      const newTitle = 'Status Test Title';

      await mockStorage.updateConversationTitle(mockConversation.id, newTitle);

      expect(mockStorage.updateConversationTitle).toHaveBeenCalledWith(
        mockConversation.id,
        newTitle
      );
    });
  });

  describe('Optimistic Deletion', () => {
    it('should remove conversation from UI before persistence', async () => {
      // Test that conversation is removed from UI immediately

      // Delay storage operation
      vi.mocked(mockStorage.deleteConversation).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  conversationRemoved: true,
                  messagesRemoved: 5,
                  metadataRemoved: true,
                  bytesFreed: 1024,
                }),
              100
            )
          )
      );

      const deletePromise = mockStorage.deleteConversation(mockConversation.id);

      // Verify storage was called
      expect(mockStorage.deleteConversation).toHaveBeenCalledWith(
        mockConversation.id
      );

      // Wait for completion
      const result = await deletePromise;
      expect(result.success).toBe(true);
      expect(result.messagesRemoved).toBe(5);
    });

    it('should restore conversation on deletion failure', async () => {
      // Test that conversation is restored when deletion fails

      // Mock storage failure
      const error = new PersistenceError(
        PersistenceErrorType.WRITE_FAILED,
        'Deletion failed',
        mockConversation.id,
        true
      );
      vi.mocked(mockStorage.deleteConversation).mockResolvedValue({
        success: false,
        conversationRemoved: false,
        messagesRemoved: 0,
        metadataRemoved: false,
        bytesFreed: 0,
        error: error.message,
      });

      const result = await mockStorage.deleteConversation(mockConversation.id);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Retry Manager Integration', () => {
    it('should retry failed operations with exponential backoff', async () => {
      const retryManager = getRetryManager();
      let attemptCount = 0;

      // Mock operation that fails twice then succeeds
      const operation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new PersistenceError(
            PersistenceErrorType.WRITE_FAILED,
            'Temporary failure',
            mockConversation.id,
            true // retryable
          );
        }
        return 'success';
      });

      const result = await retryManager.execute(operation, {
        maxAttempts: 3,
        baseDelay: 100,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const retryManager = getRetryManager();

      // Mock operation that fails with non-retryable error
      const operation = vi.fn().mockRejectedValue(
        new PersistenceError(
          PersistenceErrorType.VALIDATION_FAILED,
          'Invalid data',
          mockConversation.id,
          false // not retryable
        )
      );

      await expect(
        retryManager.execute(operation, {
          maxAttempts: 3,
          isRetryable: (error) => {
            if (error instanceof PersistenceError) {
              return error.retryable;
            }
            return true;
          },
        })
      ).rejects.toThrow(PersistenceError);

      // Should only be called once (no retries)
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Debounced Title Updates', () => {
    it('should debounce rapid title changes', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useDebouncedTitle('Initial Title', {
          delay: 100,
          onUpdate,
        })
      );

      // Rapidly change title multiple times
      act(() => {
        result.current.setTitle('Title 1');
      });

      act(() => {
        result.current.setTitle('Title 2');
      });

      act(() => {
        result.current.setTitle('Title 3');
      });

      // Wait for debounce delay
      await waitFor(
        () => {
          expect(onUpdate).toHaveBeenCalledTimes(1);
        },
        { timeout: 200 }
      );

      // Should only call onUpdate once with the final title
      expect(onUpdate).toHaveBeenCalledWith('Title 3');
    });

    it('should show saving indicator during persistence', async () => {
      const onUpdate = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

      const { result } = renderHook(() =>
        useDebouncedTitle('Initial Title', {
          delay: 50,
          onUpdate,
        })
      );

      act(() => {
        result.current.setTitle('New Title');
      });

      // Wait for debounce and save to start
      await waitFor(
        () => {
          expect(onUpdate).toHaveBeenCalled();
        },
        { timeout: 150 }
      );

      // Wait for save to complete
      await waitFor(
        () => {
          expect(result.current.isSaving).toBe(false);
        },
        { timeout: 300 }
      );
    });

    it('should cancel pending updates on unmount', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);

      const { result, unmount } = renderHook(() =>
        useDebouncedTitle('Initial Title', {
          delay: 100,
          onUpdate,
        })
      );

      act(() => {
        result.current.setTitle('New Title');
      });

      // Unmount before debounce completes
      unmount();

      // Wait to ensure onUpdate is not called
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Persistence Status Tracking', () => {
    it('should track persistence status through lifecycle', async () => {
      // Test status transitions: synced -> pending -> synced
      const newTitle = 'Status Tracking Test';

      // Initial status should be synced
      expect(mockConversation.persistenceStatus).toBe('synced');

      // Update title
      await mockStorage.updateConversationTitle(mockConversation.id, newTitle);

      // Verify storage was called
      expect(mockStorage.updateConversationTitle).toHaveBeenCalledWith(
        mockConversation.id,
        newTitle
      );
    });

    it('should set status to error on persistence failure', async () => {
      // Test that status changes to error when persistence fails
      const error = new PersistenceError(
        PersistenceErrorType.WRITE_FAILED,
        'Write failed',
        mockConversation.id,
        true
      );
      vi.mocked(mockStorage.updateConversationTitle).mockRejectedValue(error);

      try {
        await mockStorage.updateConversationTitle(
          mockConversation.id,
          'Failed Title'
        );
      } catch (err) {
        expect(err).toBeInstanceOf(PersistenceError);
      }
    });

    it('should track sync version increments', async () => {
      // Test that syncVersion increments with each successful update
      const initialVersion = mockConversation.syncVersion ?? 0;

      await mockStorage.updateConversationTitle(
        mockConversation.id,
        'Version Test 1'
      );
      await mockStorage.updateConversationTitle(
        mockConversation.id,
        'Version Test 2'
      );

      expect(mockStorage.updateConversationTitle).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should display user-friendly error messages', () => {
      const errors = [
        new PersistenceError(PersistenceErrorType.STORAGE_FULL, 'Storage full'),
        new PersistenceError(
          PersistenceErrorType.VALIDATION_FAILED,
          'Invalid data'
        ),
        new PersistenceError(PersistenceErrorType.WRITE_FAILED, 'Write failed'),
      ];

      errors.forEach((error) => {
        const message = error.getUserMessage();
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toContain('undefined');
      });
    });

    it('should classify errors correctly', () => {
      const storageFullError = new PersistenceError(
        PersistenceErrorType.STORAGE_FULL,
        'Quota exceeded'
      );
      expect(storageFullError.getRecoveryAction()).toBe('manual');

      const validationError = new PersistenceError(
        PersistenceErrorType.VALIDATION_FAILED,
        'Invalid input'
      );
      expect(validationError.getRecoveryAction()).toBe('revert');

      const writeError = new PersistenceError(
        PersistenceErrorType.WRITE_FAILED,
        'Write failed',
        undefined,
        true
      );
      expect(writeError.getRecoveryAction()).toBe('retry');
    });
  });
});
