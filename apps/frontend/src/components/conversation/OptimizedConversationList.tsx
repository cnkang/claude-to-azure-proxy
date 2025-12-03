/**
 * Optimized Conversation List
 *
 * Renders a responsive, accessible conversation list with optional
 * virtualization for large datasets. Handles search, selection,
 * renaming, and deletion in coordination with the conversation
 * management hooks.
 */

import type React from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import {
  useConversationSearch,
  useConversations,
} from '../../hooks/useConversations.js';
import type { Conversation, Message } from '../../types/index.js';
import { useDebounce } from '../../utils/performance.js';
import {
  VirtualizedList,
  type VirtualizedListRef,
} from '../common/VirtualizedList.js';
import { cn } from '../ui/Glass.js';

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
  readonly index: number;
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
    index,
  }) => {
    const lastMessage: Message | undefined =
      conversation.messages[conversation.messages.length - 1];
    const lastMessagePreview =
      lastMessage?.content.slice(0, 120) ??
      t('conversation.noMessages', 'No messages yet');

    if (!isVisible) {
      return <div className="h-28 w-full" />;
    }

    return (
      <div
        className={cn(
          'group relative p-3 rounded-xl transition-all duration-200 cursor-pointer border border-transparent',
          isActive
            ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:border-gray-200 dark:hover:border-gray-700'
        )}
        data-index={index}
        data-testid={`conversation-item-${conversation.id}`}
        role="option"
        tabIndex={0}
        aria-selected={isActive}
        aria-label={t('conversation.selectConversation', {
          title: conversation.title,
        })}
        aria-describedby={`conversation-${conversation.id}-meta`}
        onClick={() => onSelect(conversation.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(conversation.id);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            {isEditing ? (
              <input
                className="flex-1 bg-white dark:bg-gray-800 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                data-testid={`conversation-title-input-${conversation.id}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1 text-sm">
                {conversation.title}
              </h3>
            )}

            <div
              className={cn(
                'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
                (isActive || isEditing) && 'opacity-100'
              )}
            >
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="p-1 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSaveEdit();
                    }}
                    aria-label={t('conversation.saveTitle', 'Save title')}
                    data-testid={`save-title-button-${conversation.id}`}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="p-1 text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelEdit();
                    }}
                    aria-label={t('conversation.cancelEdit', 'Cancel edit')}
                    data-testid={`cancel-edit-button-${conversation.id}`}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(
                      'p-1.5 rounded transition-all duration-200',
                      'text-gray-900 dark:text-gray-100',
                      'hover:text-blue-700 dark:hover:text-blue-300',
                      'hover:bg-blue-100 dark:hover:bg-blue-900/50',
                      'ring-1 ring-gray-300 dark:ring-gray-600',
                      'hover:ring-blue-400 dark:hover:ring-blue-500'
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartEdit(conversation.id, conversation.title);
                    }}
                    aria-label={t('conversation.rename', 'Rename conversation')}
                    data-testid={`rename-conversation-button-${conversation.id}`}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'p-1.5 rounded transition-all duration-200',
                      'text-gray-900 dark:text-gray-100',
                      'hover:text-red-700 dark:hover:text-red-300',
                      'hover:bg-red-100 dark:hover:bg-red-900/50',
                      'ring-1 ring-gray-300 dark:ring-gray-600',
                      'hover:ring-red-400 dark:hover:ring-red-500'
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(conversation.id);
                    }}
                    aria-label={t('conversation.delete', 'Delete conversation')}
                    data-testid={`delete-conversation-button-${conversation.id}`}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300"
            id={`conversation-${conversation.id}-meta`}
          >
            <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
              {conversation.selectedModel}
            </span>
            <span>{formatRelativeTime(conversation.updatedAt)}</span>
          </div>

          <div className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 min-h-[2.5em]">
            {lastMessagePreview}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-gray-700">
            <span>💬</span>
            <span>
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

const OptimizedConversationListComponent = function OptimizedConversationList({
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
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

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
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleStartEdit = useCallback(
    (conversationId: string, title: string) => {
      setEditingId(conversationId);
      setEditingTitle(title);
    },
    []
  );

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

  // Enhanced keyboard navigation handler for arrow keys
  const handleKeyboardNavigation = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Don't interfere with editing or search input
      if (editingId !== null) {
        return;
      }

      // Don't handle if focus is on search input
      if (
        event.target instanceof HTMLInputElement &&
        event.target.classList.contains('search-input')
      ) {
        return;
      }

      const currentIndex =
        focusedIndex >= 0
          ? focusedIndex
          : conversations.findIndex((c) => c.id === activeConversation?.id);

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex = Math.min(
            currentIndex + 1,
            conversations.length - 1
          );
          setFocusedIndex(nextIndex);
          // Focus the next item
          const nextItem = containerRef.current?.querySelector(
            `[data-index="${nextIndex}"]`
          ) as HTMLElement;
          nextItem?.focus();
          // Scroll into view if needed
          nextItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          setFocusedIndex(prevIndex);
          // Focus the previous item
          const prevItem = containerRef.current?.querySelector(
            `[data-index="${prevIndex}"]`
          ) as HTMLElement;
          prevItem?.focus();
          // Scroll into view if needed
          prevItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
        case 'Home': {
          event.preventDefault();
          setFocusedIndex(0);
          const firstItem = containerRef.current?.querySelector(
            '[data-index="0"]'
          ) as HTMLElement;
          firstItem?.focus();
          firstItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
        case 'End': {
          event.preventDefault();
          const lastIndex = conversations.length - 1;
          setFocusedIndex(lastIndex);
          const lastItem = containerRef.current?.querySelector(
            `[data-index="${lastIndex}"]`
          ) as HTMLElement;
          lastItem?.focus();
          lastItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
        case 'Enter':
        case ' ': {
          // Enter or Space on focused item selects it
          if (currentIndex >= 0 && currentIndex < conversations.length) {
            event.preventDefault();
            const conversation = conversations[currentIndex];
            if (conversation) {
              handleSelect(conversation.id);
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [
      conversations,
      activeConversation?.id,
      editingId,
      focusedIndex,
      handleSelect,
    ]
  );

  const renderItem = useCallback(
    ({
      item,
      style,
      isVisible,
      index,
    }: {
      item: Conversation;
      style: React.CSSProperties;
      isVisible: boolean;
      index: number;
    }): React.ReactNode => (
      <div style={style} className="p-1">
        <ConversationListItem
          index={index}
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

  return (
    <section
      className={cn(
        'flex flex-col h-full bg-white/50 dark:bg-black/20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800',
        className
      )}
      data-e2e-mode={
        typeof window !== 'undefined' && window.__E2E_TEST_MODE__
          ? 'true'
          : undefined
      }
    >
      <header className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-black/20 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {t('conversation.conversations', 'Conversations')}
          </h2>
          <button
            type="button"
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors flex items-center justify-center"
            onClick={handleCreateConversation}
            disabled={state.isLoading}
            aria-label={t('conversation.newConversation', 'New conversation')}
            data-testid="new-conversation-button"
          >
            <span className="text-sm font-bold">➕</span>
          </button>
        </div>

        {showSearch ? (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t(
                'conversation.searchPlaceholder',
                'Search conversations'
              )}
              className="w-full pl-3 pr-8 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 search-input"
              aria-label={t('conversation.searchConversations', 'Search')}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
                onClick={clearSearch}
                aria-label={t('conversation.clearSearch', 'Clear search')}
              >
                ✕
              </button>
            )}
          </div>
        ) : null}
      </header>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 scroll-smooth"
        style={{ height: `${listHeight}px` }}
        onKeyDown={handleKeyboardNavigation}
        role="listbox"
        tabIndex={0}
        aria-label={t('conversation.conversationList', 'Conversation list')}
        aria-multiselectable="false"
        {...(activeConversation?.id
          ? {
              'aria-activedescendant': `conversation-${activeConversation.id}-meta`,
            }
          : {})}
      >
        {state.isLoading && (
          <div
            className="flex flex-col items-center justify-center h-32 text-gray-700 gap-2"
            role="status"
          >
            <div
              className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span className="text-sm">
              {t('conversation.loading', 'Loading conversations…')}
            </span>
          </div>
        )}

        {state.error && (
          <div
            className="p-4 m-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-200 text-sm flex items-center gap-2"
            role="alert"
          >
            <span className="text-lg" aria-hidden="true">
              ⚠️
            </span>
            <span>{state.error}</span>
          </div>
        )}

        {!state.isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-gray-700 dark:text-gray-300">
            <div className="text-4xl mb-3 opacity-50" aria-hidden="true">
              💬
            </div>
            <p className="font-medium mb-1">
              {t('sidebar.noConversations', 'No conversations yet')}
            </p>
            <p className="text-sm opacity-75">
              {t(
                'sidebar.startFirstConversation',
                'Create a new conversation to get started.'
              )}
            </p>
          </div>
        ) : null}

        {!state.isLoading &&
          conversations.length > 0 &&
          (shouldVirtualize ? (
            <VirtualizedList
              ref={listRef}
              items={conversations}
              itemHeight={112}
              height={listHeight}
              overscan={6}
              renderItem={renderItem}
              className="w-full"
            />
          ) : (
            <div className="flex flex-col gap-1">
              {conversations.map((conversation, index) => (
                <ConversationListItem
                  key={conversation.id}
                  index={index}
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
          ))}
      </div>

      {showSearch && isSearching && (
        <div className="p-2 text-center text-xs text-gray-700 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          {t('conversation.searching', 'Searching conversations…')}
        </div>
      )}
    </section>
  );
};

export const OptimizedConversationList = memo(
  OptimizedConversationListComponent
);
