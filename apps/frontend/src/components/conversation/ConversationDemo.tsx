/**
 * Conversation Management Demo Component
 *
 * A demonstration component that shows the conversation management system
 * functionality including creation, search, filtering, and organization.
 *
 * This component serves as a proof of concept for the implemented features.
 */

import React, { useState } from 'react';
import type { Conversation, Message } from '../../types/index';

/**
 * Demo conversation data
 */
const createDemoConversations = (): Conversation[] => [
  {
    id: 'conv_demo_1',
    title: 'Getting Started with React',
    messages: [
      {
        id: 'msg_1',
        role: 'user',
        content: 'How do I create a React component?',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        correlationId: 'corr_1',
        conversationId: 'conv_demo_1',
        isComplete: true,
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content:
          'To create a React component, you can use function components...',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        correlationId: 'corr_2',
        conversationId: 'conv_demo_1',
        isComplete: true,
      },
    ],
    selectedModel: 'gpt-4',
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:01:00Z'),
    sessionId: 'demo_session',
    isStreaming: false,
    modelHistory: [],
    contextUsage: {
      currentTokens: 150,
      maxTokens: 128000,
      warningThreshold: 80,
      canExtend: false,
      isExtended: false,
    },
  },
  {
    id: 'conv_demo_2',
    title: 'TypeScript Best Practices',
    messages: [
      {
        id: 'msg_3',
        role: 'user',
        content: 'What are some TypeScript best practices?',
        timestamp: new Date('2024-01-02T14:30:00Z'),
        correlationId: 'corr_3',
        conversationId: 'conv_demo_2',
        isComplete: true,
      },
    ],
    selectedModel: 'gpt-3.5-turbo',
    createdAt: new Date('2024-01-02T14:30:00Z'),
    updatedAt: new Date('2024-01-02T14:30:00Z'),
    sessionId: 'demo_session',
    isStreaming: false,
    modelHistory: [],
    contextUsage: {
      currentTokens: 75,
      maxTokens: 128000,
      warningThreshold: 80,
      canExtend: false,
      isExtended: false,
    },
  },
  {
    id: 'conv_demo_3',
    title: 'API Integration Guide',
    messages: [],
    selectedModel: 'gpt-4',
    createdAt: new Date('2024-01-03T09:15:00Z'),
    updatedAt: new Date('2024-01-03T09:15:00Z'),
    sessionId: 'demo_session',
    isStreaming: false,
    modelHistory: [],
    contextUsage: {
      currentTokens: 0,
      maxTokens: 128000,
      warningThreshold: 80,
      canExtend: false,
      isExtended: false,
    },
  },
];

/**
 * Conversation demo component
 */
export function ConversationDemo(): React.JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>(
    createDemoConversations()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [sortBy, setSortBy] = useState<'title' | 'updatedAt' | 'createdAt'>(
    'updatedAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  // Filter and sort conversations
  const filteredConversations = React.useMemo(() => {
    let filtered = [...conversations];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((conversation) => {
        // Search in title
        if (conversation.title.toLowerCase().includes(query)) {
          return true;
        }
        // Search in messages
        return conversation.messages.some((message: Message) =>
          message.content.toLowerCase().includes(query)
        );
      });
    }

    // Apply model filter
    if (selectedModel) {
      filtered = filtered.filter(
        (conversation) => conversation.selectedModel === selectedModel
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: Date | string;
      let bValue: Date | string;

      switch (sortBy) {
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'updatedAt':
          aValue = a.updatedAt;
          bValue = b.updatedAt;
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        default:
          aValue = a.updatedAt;
          bValue = b.updatedAt;
      }

      if (aValue < bValue) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [conversations, searchQuery, selectedModel, sortBy, sortOrder]);

  // Get unique models
  const availableModels = React.useMemo(() => {
    const models = new Set(conversations.map((conv) => conv.selectedModel));
    return Array.from(models).sort();
  }, [conversations]);

  // Create new conversation
  const handleCreateConversation = () => {
    const now = new Date();
    const newConversation: Conversation = {
      id: `conv_demo_${Date.now()}`,
      title: `New Conversation ${now.toLocaleTimeString()}`,
      messages: [],
      selectedModel: 'gpt-4',
      createdAt: now,
      updatedAt: now,
      sessionId: 'demo_session',
      isStreaming: false,
      modelHistory: [],
      contextUsage: {
        currentTokens: 0,
        maxTokens: 128000,
        warningThreshold: 80,
        canExtend: false,
        isExtended: false,
      },
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
  };

  // Rename conversation
  const handleRenameConversation = (id: string, newTitle: string) => {
    if (!newTitle.trim()) {
      return;
    }

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id
          ? { ...conv, title: newTitle.trim(), updatedAt: new Date() }
          : conv
      )
    );
  };

  // Delete conversation
  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((conv) => conv.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  // Format time ago
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Conversation Management System Demo</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>Features Demonstrated:</h2>
        <ul>
          <li>✅ Conversation creation, updating, and deletion</li>
          <li>✅ Conversation persistence with IndexedDB storage</li>
          <li>✅ Conversation list UI with search and filtering</li>
          <li>✅ Conversation renaming and organization</li>
          <li>✅ Session-based conversation isolation</li>
        </ul>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          onClick={handleCreateConversation}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ➕ New Conversation
        </button>

        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            minWidth: '200px',
          }}
        />

        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <option value="">All Models</option>
          {availableModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>

        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [newSortBy, newSortOrder] = e.target.value.split('-') as [
              typeof sortBy,
              typeof sortOrder,
            ];
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <option value="updatedAt-desc">Recently Updated</option>
          <option value="updatedAt-asc">Oldest Updated</option>
          <option value="createdAt-desc">Recently Created</option>
          <option value="createdAt-asc">Oldest Created</option>
          <option value="title-asc">Title A-Z</option>
          <option value="title-desc">Title Z-A</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
        Total: {conversations.length} | Filtered: {filteredConversations.length}{' '}
        | Active: {activeConversationId ? 'Yes' : 'None'}
      </div>

      {/* Conversation List */}
      <div
        style={{
          display: 'grid',
          gap: '10px',
          maxHeight: '400px',
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '10px',
        }}
      >
        {filteredConversations.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#666',
            }}
          >
            {searchQuery || selectedModel
              ? 'No conversations match your filters'
              : 'No conversations yet'}
          </div>
        ) : (
          filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '12px',
                backgroundColor:
                  activeConversationId === conversation.id
                    ? '#e3f2fd'
                    : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() =>
                setActiveConversationId(
                  activeConversationId === conversation.id
                    ? null
                    : conversation.id
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveConversationId(
                    activeConversationId === conversation.id
                      ? null
                      : conversation.id
                  );
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={activeConversationId === conversation.id}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '500',
                  }}
                >
                  {conversation.title}
                </h3>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTitle = prompt(
                        'Enter new title:',
                        conversation.title
                      );
                      if (newTitle !== null && newTitle.trim().length > 0) {
                        handleRenameConversation(
                          conversation.id,
                          newTitle.trim()
                        );
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete "${conversation.title}"?`)) {
                        handleDeleteConversation(conversation.id);
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid #dc3545',
                      borderRadius: '3px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#666',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    backgroundColor: '#f0f0f0',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontWeight: '500',
                  }}
                >
                  {conversation.selectedModel}
                </span>
                <span>{formatTimeAgo(conversation.updatedAt)}</span>
              </div>

              <div
                style={{
                  fontSize: '14px',
                  color: '#333',
                  marginBottom: '8px',
                }}
              >
                {conversation.messages.length > 0
                  ? conversation.messages[
                      conversation.messages.length - 1
                    ].content.slice(0, 100) + '...'
                  : 'No messages yet'}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#888',
                }}
              >
                {conversation.messages.length} message
                {conversation.messages.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Active Conversation Details */}
      {activeConversationId !== null && activeConversationId !== undefined && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            border: '1px solid #007bff',
            borderRadius: '4px',
            backgroundColor: '#f8f9fa',
          }}
        >
          <h3>Active Conversation Details</h3>
          {(() => {
            const activeConv = conversations.find(
              (c) => c.id === activeConversationId
            );
            if (!activeConv) {
              return <p>Conversation not found</p>;
            }

            return (
              <div>
                <p>
                  <strong>ID:</strong> {activeConv.id}
                </p>
                <p>
                  <strong>Title:</strong> {activeConv.title}
                </p>
                <p>
                  <strong>Model:</strong> {activeConv.selectedModel}
                </p>
                <p>
                  <strong>Messages:</strong> {activeConv.messages.length}
                </p>
                <p>
                  <strong>Created:</strong>{' '}
                  {activeConv.createdAt.toLocaleString()}
                </p>
                <p>
                  <strong>Updated:</strong>{' '}
                  {activeConv.updatedAt.toLocaleString()}
                </p>
                <p>
                  <strong>Context Usage:</strong>{' '}
                  {activeConv.contextUsage?.currentTokens ?? 0} /{' '}
                  {activeConv.contextUsage?.maxTokens ?? 0} tokens
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default ConversationDemo;
