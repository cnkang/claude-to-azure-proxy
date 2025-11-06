/**
 * Optimized Conversation List
 *
 * Renders a responsive, accessible conversation list with optional
 * virtualization for large datasets. Handles search, selection,
 * renaming, and deletion in coordination with the conversation
 * management hooks.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Conversation, Message } from '../../types/index.js';
import {
  useConversations,
  useConversationSearch,
} from '../../hooks/useConversations.js';
import { useI18n } from '../../contexts/I18nContext.js';
import {
  VirtualizedList,
  type VirtualizedListRef,
} from '../common/VirtualizedList.js';
import { useDebounce } from '../../utils/performance.js';
import './ConversationList.css';

export interface OptimizedConversationListProps {
  readonly className?: string;
  readonly onConversationSelect?: (conversationId: string) => void;
  readonly enableVirtualScrolling?: boolean;
  readonly listHeight?: number;
  readonly showSearch?: boolean;
}

interface ConversationListItemProps {
  readonly conversation: Conversation;
  readonly isActive: boolean;
  readonly isEditing: boolean;
  readonly editTitle: string;
  readonly isVisible: boolean;
  readonly onSelect: (conversationId: string) => void;
  readonly onStartEdit: (conversationId: string, currentTitle: string) => void;
  readonly onTitleChange: (value: string) => void;
  readonly onSaveEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onDelete: (conversationId: string) => void;
  readonly formatRelativeTime: (date: Date) => string;
  readonly t: ReturnType<typeof useI18n>['t'];
}

const ConversationListItem = memo<ConversationListItemProps>(
  ({
    conversation,
    isActive,
    isEditing,
    editTitle,
    isVisible,
    onSelect,
    onStartEdit,
    onTitleChange,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    formatRelativeTime,
    t,
  }) => {
    const lastMessage: Message | undefined =
      conversation.messages[conversation.messages.length - 1];
    const lastMessagePreview =
      lastMessage?.content.slice(0, 120) ??
      t('conversation.noMessages', 'No messages yet');

    if (!isVisible) {
      return <div className="conversation-list-item ghost" />;
    }

    return (
      <div
        className={[
          'conversation-list-item',
          'optimized',
          isActive ? 'active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        aria-pressed={isActive}
        aria-label={t('conversation.selectConversation', {
          title: conversation.title,
        })}
        onClick={() => onSelect(conversation.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(conversation.id);
          }
        }}
      >
        <div className="conversation-item-content">
          <div className="conversation-item-header">
            {isEditing ? (
              <input
                className="conversation-title-input"
                value={editTitle}
                onChange={(event) => onTitleChange(event.target.value)}
                onBlur={onSaveEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSaveEdit();
                  } else if (event.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
                aria-label={t('conversation.editTitle', 'Edit title')}
              />
            ) : (
              <h3 className="conversation-title">{conversation.title}</h3>
            )}

            <div className="conversation-actions">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="conversation-action-btn"
                    onClick={onSaveEdit}
                    aria-label={t('conversation.saveTitle', 'Save title')}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="conversation-action-btn"
                    onClick={onCancelEdit}
                    aria-label={t('conversation.cancelEdit', 'Cancel edit')}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="conversation-action-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartEdit(conversation.id, conversation.title);
                    }}
                    aria-label={t('conversation.rename', 'Rename conversation')}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="conversation-action-btn delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(conversation.id);
                    }}
                    aria-label={t('conversation.delete', 'Delete conversation')}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="conversation-item-meta">
            <span className="conversation-model">
              {conversation.selectedModel}
            </span>
            <span className="conversation-time">
              {formatRelativeTime(conversation.updatedAt)}
            </span>
          </div>

          <div className="conversation-preview">{lastMessagePreview}</div>

          <div className="conversation-stats">
            <span className="message-count">
              {t('conversation.messageCount', {
                count: conversation.messages.length,
              })}
            </span>
          </div>
        </div>
      </div>
    );
  }
);

ConversationListItem.displayName = 'ConversationListItem';

export function OptimizedConversationList({
  className = '',
  onConversationSelect,
  enableVirtualScrolling = true,
  listHeight = 520,
  showSearch = true,
}: OptimizedConversationListProps): React.JSX.Element {
  const {
    filteredConversations,
    activeConversation,
    setActiveConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    state,
  } = useConversations();
  const { searchQuery, setSearchQuery, clearSearch, isSearching } =
    useConversationSearch();
  const { t, formatRelativeTime } = useI18n();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const debouncedSearch = useDebounce(searchQuery, 250);

  useEffect(() => {
    if (debouncedSearch !== searchQuery) {
      setSearchQuery(debouncedSearch);
    }
  }, [debouncedSearch, searchQuery, setSearchQuery]);

  const conversations = filteredConversations;
  const shouldVirtualize =
    enableVirtualScrolling && conversations.length > 50 && listHeight >= 320;

  const listRef = useRef<VirtualizedListRef>(null);

  const handleSelect = useCallback(
    (conversationId: string): void => {
      setActiveConversation(conversationId);
      onConversationSelect?.(conversationId);
    },
    [setActiveConversation, onConversationSelect]
  );

  const handleCreateConversation = useCallback(async (): Promise<void> => {
    try {
      const conversation = await createConversation();
      handleSelect(conversation.id);
    } catch (error) {
      // eslint-disable-next-line no-console -- surfaced during development
      console.error('Failed to create conversation', error);
    }
  }, [createConversation, handleSelect]);

  const handleStartEdit = useCallback((conversationId: string, title: string) => {
    setEditingId(conversationId);
    setEditingTitle(title);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const targetId = editingId;
    const newTitle = editingTitle.trim();

    if (!targetId || newTitle.length === 0) {
      handleCancelEdit();
      return;
    }

    try {
      await renameConversation(targetId, newTitle);
    } catch (error) {
      // eslint-disable-next-line no-console -- surfaced during development
      console.error('Failed to rename conversation', error);
    } finally {
      handleCancelEdit();
    }
  }, [editingId, editingTitle, renameConversation, handleCancelEdit]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation(conversationId);
        if (editingId === conversationId) {
          handleCancelEdit();
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- surfaced during development
        console.error('Failed to delete conversation', error);
      }
    },
    [deleteConversation, editingId, handleCancelEdit]
  );

  const renderItem = useCallback(
    ({
      item,
      style,
      isVisible,
    }: {
      item: Conversation;
      style: React.CSSProperties;
      isVisible: boolean;
    }): React.ReactNode => (
      <div style={style}>
        <ConversationListItem
          conversation={item}
          isActive={item.id === activeConversation?.id}
          isEditing={editingId === item.id}
          editTitle={editingId === item.id ? editingTitle : item.title}
          isVisible={isVisible}
          onSelect={handleSelect}
          onStartEdit={handleStartEdit}
          onTitleChange={setEditingTitle}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDelete={handleDeleteConversation}
          formatRelativeTime={formatRelativeTime}
          t={t}
        />
      </div>
    ),
    [
      activeConversation?.id,
      editingId,
      editingTitle,
      handleSelect,
      handleStartEdit,
      handleSaveEdit,
      handleCancelEdit,
      handleDeleteConversation,
      formatRelativeTime,
      t,
    ]
  );

  const listClassName = ['optimized-conversation-list', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={listClassName}>
      <header className="conversation-list-header">
        <div className="conversation-list-title">
          <h2>{t('conversation.conversations', 'Conversations')}</h2>
          <button
            type="button"
            className="new-conversation-btn"
            onClick={handleCreateConversation}
            disabled={state.isLoading}
            aria-label={t('conversation.newConversation', 'New conversation')}
          >
            <span className="icon-plus">➕</span>
          </button>
        </div>

        {showSearch ? (
          <div className="conversation-search">
            <div className="search-input-container">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t(
                  'conversation.searchPlaceholder',
                  'Search conversations'
                )}
                className="search-input"
                aria-label={t('conversation.searchConversations', 'Search')}
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={clearSearch}
                  aria-label={t('conversation.clearSearch', 'Clear search')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <div
        className="conversation-list-container"
        style={{ height: `${listHeight}px` }}
      >
        {state.isLoading && (
          <div className="conversation-list-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <span>{t('conversation.loading', 'Loading conversations…')}</span>
          </div>
        )}

        {state.error && (
          <div className="conversation-list-error" role="alert">
            <span className="error-icon" aria-hidden="true">
              ⚠️
            </span>
            <span>{state.error}</span>
          </div>
        )}

        {!state.isLoading && conversations.length === 0 ? (
          <div className="conversation-list-empty">
            <div className="empty-icon" aria-hidden="true">
              💬
            </div>
            <p>{t('sidebar.noConversations', 'No conversations yet')}</p>
            <p className="empty-hint">
              {t(
                'sidebar.startFirstConversation',
                'Create a new conversation to get started.'
              )}
            </p>
          </div>
        ) : null}

        {!state.isLoading && conversations.length > 0 && (
          <>
            {shouldVirtualize ? (
              <VirtualizedList
                ref={listRef}
                items={conversations}
                itemHeight={112}
                height={listHeight}
                overscan={6}
                renderItem={renderItem}
                className="virtualized-conversation-list"
              />
            ) : (
              <div className="conversation-items">
                {conversations.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={conversation.id === activeConversation?.id}
                    isEditing={editingId === conversation.id}
                    editTitle={
                      editingId === conversation.id
                        ? editingTitle
                        : conversation.title
                    }
                    isVisible
                    onSelect={handleSelect}
                    onStartEdit={handleStartEdit}
                    onTitleChange={setEditingTitle}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onDelete={handleDeleteConversation}
                    formatRelativeTime={formatRelativeTime}
                    t={t}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showSearch && isSearching && (
        <div className="conversation-search-status">
          {t('conversation.searching', 'Searching conversations…')}
        </div>
      )}
    </section>
  );
}
