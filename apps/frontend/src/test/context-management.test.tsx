import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../types/index.js';
import type { UseConversationsReturn } from '../hooks/useConversations.js';
import { TestWrapper } from './test-wrapper.js';
import { createUseSessionMock } from './mocks/session-context.js';

const storageMock = {
  initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getAllConversations: vi
    .fn<() => Promise<Conversation[]>>()
    .mockResolvedValue([]),
  storeConversation: vi
    .fn<(conversation: Conversation) => Promise<void>>()
    .mockResolvedValue(undefined),
  deleteConversation: vi
    .fn<(conversationId: string) => Promise<void>>()
    .mockResolvedValue(undefined),
};

const sessionManagerMock = {
  getSessionId: vi.fn<() => string>().mockReturnValue('session-ctx'),
};

const sessionHookMock = createUseSessionMock({
  session: {
    sessionId: 'session-ctx',
    preferences: {
      theme: 'light',
      language: 'en',
      selectedModel: 'gpt-4o',
    },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  sessionId: 'session-ctx',
});

vi.mock('../services/storage.js', () => ({
  getConversationStorage: () => storageMock,
}));

vi.mock('../services/session.js', () => ({
  getSessionManager: () => sessionManagerMock,
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => sessionHookMock,
}));

const createConversation = (overrides?: Partial<Conversation>): Conversation => {
  const now = new Date('2024-02-01T12:00:00.000Z');
  return {
    id: overrides?.id ?? 'conv-1',
    title: overrides?.title ?? 'Existing conversation',
    selectedModel: overrides?.selectedModel ?? 'gpt-4o',
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    sessionId: overrides?.sessionId ?? 'session-ctx',
    isStreaming: overrides?.isStreaming ?? false,
    messages:
      overrides?.messages ??
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Welcome to the project workspace',
          timestamp: now,
          correlationId: 'corr-1',
          conversationId: overrides?.id ?? 'conv-1',
          isComplete: true,
        },
      ],
    modelHistory: overrides?.modelHistory ?? [],
    contextUsage: overrides?.contextUsage ?? {
      currentTokens: 128,
      maxTokens: 128000,
      warningThreshold: 80,
      canExtend: false,
      isExtended: false,
    },
    compressionHistory: overrides?.compressionHistory ?? [],
  };
};

const loadHookEnvironment = async (): Promise<{
  useConversations: () => UseConversationsReturn;
  useConversationOrganization: typeof import('../hooks/useConversations.js').useConversationOrganization;
  useConversationSearch: typeof import('../hooks/useConversations.js').useConversationSearch;
  wrapper: React.FC<{ children: React.ReactNode }>;
}> => {
  vi.resetModules();
  const [hooksModule, wrapperModule] = await Promise.all([
    import('../hooks/useConversations.js'),
    import('./test-wrapper.js'),
  ]);
  return {
    useConversations: hooksModule.useConversations,
    useConversationOrganization: hooksModule.useConversationOrganization,
    useConversationSearch: hooksModule.useConversationSearch,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <wrapperModule.TestWrapper>{children}</wrapperModule.TestWrapper>
    ),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.initialize.mockClear();
  storageMock.getAllConversations.mockClear();
  storageMock.storeConversation.mockClear();
  storageMock.deleteConversation.mockClear();
  sessionManagerMock.getSessionId.mockClear();
  sessionManagerMock.getSessionId.mockReturnValue('session-ctx');
  sessionHookMock.session = {
    ...sessionHookMock.session!,
    preferences: {
      ...sessionHookMock.session!.preferences,
      language: 'en',
      theme: 'light',
    },
  };
  sessionHookMock.sessionId = sessionHookMock.session!.sessionId;
});

describe('useConversations', () => {
  it('hydrates stored conversations and supports CRUD operations', async () => {
    const storedConversation = createConversation();
    storageMock.getAllConversations.mockResolvedValue([storedConversation]);

    const { useConversations, wrapper } = await loadHookEnvironment();
    const { result } = renderHook(() => useConversations(), { wrapper });

    await waitFor(() => {
      expect(storageMock.initialize).toHaveBeenCalled();
      expect(storageMock.getAllConversations).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.conversations[0].title).toBe('Existing conversation');
    });

    let createdId = '';
    await act(async () => {
      const created = await result.current.createConversation('Design review', 'gpt-4o-mini');
      createdId = created.id;
    });

    expect(sessionManagerMock.getSessionId).toHaveBeenCalled();
    expect(storageMock.storeConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Design review',
        selectedModel: 'gpt-4o-mini',
        sessionId: 'session-ctx',
      })
    );

    await waitFor(() => {
      expect(
        result.current.conversations.some((conv) => conv.id === createdId)
      ).toBe(true);
    });

    await act(async () => {
      await result.current.renameConversation(createdId, 'Planning sync');
    });

    expect(storageMock.storeConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: createdId,
        title: 'Planning sync',
      })
    );

    await act(async () => {
      await result.current.deleteMultipleConversations([createdId]);
    });

    expect(storageMock.deleteConversation).toHaveBeenCalledWith(createdId);
    await waitFor(() => {
      expect(
        result.current.conversations.every((conv) => conv.id !== createdId)
      ).toBe(true);
    });
  });

  it('applies filtering, searching, and exporting behaviour', async () => {
    const storedConversation = createConversation({
      id: 'conv-search',
      title: 'Frontend Implementation',
      messages: [
        {
          id: 'msg-search',
          role: 'user',
          content: 'Search for design tokens',
          timestamp: new Date('2024-02-02T09:30:00.000Z'),
          correlationId: 'corr-search',
          conversationId: 'conv-search',
          isComplete: true,
        },
      ],
    });

    const secondaryConversation = createConversation({
      id: 'conv-secondary',
      title: 'Backend Integration',
      selectedModel: 'gpt-4o',
      updatedAt: new Date('2024-03-01T08:00:00.000Z'),
    });

    storageMock.getAllConversations.mockResolvedValue([
      storedConversation,
      secondaryConversation,
    ]);

    const {
      useConversations,
      useConversationOrganization,
      useConversationSearch,
      wrapper,
    } = await loadHookEnvironment();

    const combinedHook = renderHook(
      () => ({
        conv: useConversations(),
        org: useConversationOrganization(),
        search: useConversationSearch(),
      }),
      { wrapper }
    );
    await waitFor(() =>
      expect(combinedHook.result.current.conv.conversations).toHaveLength(2)
    );

    act(() => {
      combinedHook.result.current.conv.setFilters({ model: 'gpt-4o' });
      combinedHook.result.current.conv.setSearchQuery('design tokens');
    });

    await waitFor(() => {
      expect(combinedHook.result.current.conv.filteredConversations).toHaveLength(1);
      expect(combinedHook.result.current.conv.filteredConversations[0].id).toBe('conv-search');
    });

    act(() => {
      combinedHook.result.current.conv.clearSearch();
      combinedHook.result.current.conv.clearFilters();
    });

    const exportPayload = await combinedHook.result.current.conv.exportConversations();
    const parsed = JSON.parse(exportPayload) as {
      conversations: Array<{ id: string; messages: Array<{ timestamp: string }> }>;
      conversationCount: number;
    };

    expect(parsed.conversationCount).toBe(2);
    expect(parsed.conversations[0].messages[0].timestamp).toMatch(/T/);

    await act(async () => {
      combinedHook.result.current.org.setSorting('title', 'asc');
    });

    await waitFor(() => {
      expect(combinedHook.result.current.conv.state.filters.sortBy).toBe('title');
      expect(combinedHook.result.current.conv.state.filters.sortOrder).toBe('asc');
    });

    act(() => {
      combinedHook.result.current.search.setSearchQuery('Integration');
    });

    await waitFor(() => {
      expect(combinedHook.result.current.search.isSearching).toBe(true);
      expect(
        combinedHook.result.current.search.searchResults.some((c) => c.id === 'conv-secondary')
      ).toBe(true);
    });

    act(() => {
      combinedHook.result.current.search.clearSearch();
    });

    expect(combinedHook.result.current.search.isSearching).toBe(false);
  });
});
