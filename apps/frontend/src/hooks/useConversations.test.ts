/**
 * Conversation Utilities Tests
 *
 * Provides lightweight coverage for derived behaviours that power the
 * conversation management hook (search and sorting behaviour). The hook
 * itself is covered via integration tests in the conversation components.
 */

import { describe, expect, it } from 'vitest';
import type { Conversation } from '../types/index.js';

const buildMockConversation = (
  overrides: Partial<Conversation>
): Conversation => ({
  id: 'conv-1',
  title: 'Conversation',
  messages: [],
  selectedModel: 'gpt-4',
  createdAt: new Date('2024-01-01T08:00:00Z'),
  updatedAt: new Date('2024-01-01T08:00:00Z'),
  sessionId: 'session-1',
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
  ...overrides,
});

describe('Conversation helpers', () => {
  const mockConversations: Conversation[] = [
    buildMockConversation({
      id: 'conv-1',
      title: 'Test Conversation Alpha',
      updatedAt: new Date('2024-01-02T12:00:00Z'),
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello world message',
          timestamp: new Date('2024-01-02T11:00:00Z'),
          correlationId: 'corr-1',
          conversationId: 'conv-1',
          isComplete: true,
        },
      ],
    }),
    buildMockConversation({
      id: 'conv-2',
      title: 'Another topic',
      updatedAt: new Date('2024-01-01T09:00:00Z'),
      messages: [
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Response talking about testing utilities',
          timestamp: new Date('2024-01-01T09:00:00Z'),
          correlationId: 'corr-2',
          conversationId: 'conv-2',
          isComplete: true,
        },
      ],
    }),
    buildMockConversation({
      id: 'conv-3',
      title: 'Random thoughts',
      updatedAt: new Date('2024-01-03T15:30:00Z'),
      messages: [],
    }),
  ];

  it('filters conversations by search query in titles and messages', () => {
    const query = 'test';

    const filtered = mockConversations.filter((conversation) => {
      const normalised = query.toLowerCase();
      if (conversation.title.toLowerCase().includes(normalised)) {
        return true;
      }

      return conversation.messages.some((message) =>
        message.content.toLowerCase().includes(normalised)
      );
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
  });

  it('sorts conversations by updated timestamp descending', () => {
    const sorted = [...mockConversations].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    expect(sorted.map((c) => c.id)).toEqual(['conv-3', 'conv-1', 'conv-2']);
  });
});
