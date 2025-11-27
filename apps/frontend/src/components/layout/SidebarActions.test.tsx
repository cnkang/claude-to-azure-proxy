import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, vi, it } from 'vitest';
import type { Conversation } from '../../types/index.js';
import { Sidebar } from './Sidebar.js';

const baseConversation: Conversation = {
  id: 'conv-1',
  title: 'Test conversation',
  selectedModel: 'gpt-4o',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  sessionId: 'session-1',
  isStreaming: false,
  messages: [
    {
      id: 'msg-1',
      role: 'assistant',
      content: 'Hello world',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      correlationId: 'corr-1',
      conversationId: 'conv-1',
      isComplete: true,
    },
  ],
  modelHistory: [],
  contextUsage: {
    currentTokens: 0,
    maxTokens: 0,
    warningThreshold: 80,
    canExtend: false,
    isExtended: false,
  },
  compressionHistory: [],
};

const mockSetActiveConversation = vi.fn();
const mockUpdateConversation = vi.fn();
const mockDeleteConversation = vi.fn();
const mockAddConversation = vi.fn();

vi.mock('../../contexts/AppContext.js', () => ({
  useConversations: () => ({
    activeConversation: baseConversation,
    conversationsList: [baseConversation],
    setActiveConversation: mockSetActiveConversation,
    addConversation: mockAddConversation,
    updateConversation: mockUpdateConversation,
    deleteConversation: mockDeleteConversation,
  }),
}));

vi.mock('../../contexts/I18nContext.js', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    formatRelativeTime: () => 'just now',
  }),
}));

vi.mock('../../contexts/SessionContext.js', () => ({
  useSessionContext: () => ({
    session: {
      sessionId: 'session-1',
      preferences: { selectedModel: 'gpt-4o', theme: 'light', language: 'en' },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
  }),
}));

vi.mock('../../services/session.js', () => ({
  getSessionManager: () => ({
    getSessionId: () => 'session-1',
  }),
}));

vi.mock('../../services/conversations.js', () => ({
  createConversation: vi.fn().mockResolvedValue({
    id: 'conv-2',
    title: 'New conversation',
    model: 'gpt-4o',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

vi.mock('../search/ConversationSearch.js', () => ({
  ConversationSearch: () => <div data-testid="conversation-search-mock" />,
}));

vi.mock('../common/DropdownMenu.js', () => ({
  DropdownMenu: ({ isOpen, items }: { isOpen: boolean; items: Array<{ id: string; label: string; onClick: () => void }> }) => (
    isOpen ? (
      <div data-testid="dropdown-menu">
        {items.map(item => (
          <button key={item.id} data-testid={`dropdown-item-${item.id}`} onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </div>
    ) : null
  ),
}));

vi.mock('../common/ConfirmDialog.js', () => ({
  ConfirmDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="confirm-dialog">Confirm Dialog</div> : null
  ),
}));

describe('Sidebar conversation actions menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the dropdown menu when the options button is clicked', () => {
    render(<Sidebar isOpen={true} isMobile={false} onClose={() => {}} />);

    // Options button should be present for the conversation
    const optionsButton = screen.getByTestId(
      `conversation-options-${baseConversation.id}`
    );
    
    // Initially, dropdown should not be visible
    expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
    
    // Click the options button
    fireEvent.click(optionsButton);

    // Dropdown menu should now be visible
    expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    
    // Dropdown items should be visible
    expect(screen.getByTestId('dropdown-item-rename')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-item-delete')).toBeInTheDocument();
  });
});
