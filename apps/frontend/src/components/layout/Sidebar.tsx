/**
 * Sidebar Component
 *
 * Navigation sidebar with conversation list, new conversation button,
 * and responsive behavior for mobile devices.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React, { useEffect, useRef, useState } from 'react';
import { isNonEmptyString } from '@repo/shared-utils';
import { useConversations } from '../../contexts/AppContext.js';
import { useI18n } from '../../contexts/I18nContext.js';
import { useSessionContext } from '../../contexts/SessionContext.js';
import { frontendLogger } from '../../utils/logger.js';
import { createConversation } from '../../services/conversations.js';
import { getSessionManager } from '../../services/session.js';
import type { Conversation } from '../../types/index.js';
import { DropdownMenu } from '../common/DropdownMenu.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import { ConversationSearch } from '../search/ConversationSearch.js';
import './Sidebar.css';

/**
 * Sidebar props
 */
export interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}

/**
 * Sidebar component
 */
export function Sidebar({
  isOpen,
  isMobile,
  onClose,
}: SidebarProps): React.JSX.Element {
  const {
    activeConversation,
    conversationsList,
    setActiveConversation,
    addConversation,
    updateConversation,
    deleteConversation,
  } = useConversations();
  const { t, formatRelativeTime } = useI18n();
  const { session } = useSessionContext();
  const sessionManagerRef = useRef(getSessionManager());
  const sidebarRef = useRef<HTMLElement>(null);
  const sessionId = session?.sessionId ?? '';

  // State for dropdown menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // State for rename functionality
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // State for delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<
    string | null
  >(null);

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen && isMobile && sidebarRef.current) {
      // Focus the sidebar when it opens on mobile
      sidebarRef.current.focus();
    }
  }, [isOpen, isMobile]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleConversationSelect = (conversationId: string): void => {
    setActiveConversation(conversationId);

    // Close sidebar on mobile after selection
    if (isMobile === true) {
      onClose();
    }
  };

  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const openConversationMenu = (
    conversationId: string,
    anchorElement: HTMLElement
  ): void => {
    setMenuAnchor(anchorElement);
    setMenuOpen(conversationId);
  };

  const handleOptionsClick = (
    event: React.MouseEvent,
    conversationId: string
  ): void => {
    event.stopPropagation();
    openConversationMenu(conversationId, event.currentTarget as HTMLElement);
  };

  const handleConversationMenuKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    conversationId: string
  ): void => {
    const isContextMenuTrigger =
      event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');

    if (isContextMenuTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openConversationMenu(conversationId, event.currentTarget);
    }
  };

  const handleConversationContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    conversationId: string
  ): void => {
    event.preventDefault();
    openConversationMenu(conversationId, event.currentTarget);
  };

  const handleMenuClose = (): void => {
    setMenuOpen(null);
    setMenuAnchor(null);
  };

  const handleRenameStart = (conversation: Conversation): void => {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
    handleMenuClose();
  };

  const handleRenameCancel = (): void => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameSave = async (conversationId: string): Promise<void> => {
    const trimmedTitle = renameValue.trim();

    // Validation
    if (!trimmedTitle) {
      frontendLogger.error('Rename failed: title cannot be empty', {
        metadata: { conversationId },
      });
      // TODO: Show error message to user
      return;
    }

    if (trimmedTitle.length > 100) {
      frontendLogger.error('Rename failed: title too long', {
        metadata: { conversationId, length: trimmedTitle.length },
      });
      // TODO: Show error message to user
      return;
    }

    try {
      // Update conversation title (AppContext will handle storage sync)
      updateConversation(conversationId, { title: trimmedTitle });

      frontendLogger.info('Conversation renamed successfully', {
        metadata: {
          conversationId,
          newTitle: trimmedTitle,
        },
      });

      // TODO: Show success message to user

      // Clear rename state
      handleRenameCancel();
    } catch (error) {
      frontendLogger.error('Failed to rename conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { conversationId },
      });

      // TODO: Show error message to user
    }
  };

  const handleRenameKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    conversationId: string
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleRenameSave(conversationId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleRenameCancel();
    }
  };

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleDeleteStart = (conversationId: string): void => {
    setConversationToDelete(conversationId);
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  const handleDeleteCancel = (): void => {
    setDeleteConfirmOpen(false);
    setConversationToDelete(null);
  };

  const handleDeleteConfirm = (): void => {
    if (!conversationToDelete) {
      return;
    }

    try {
      // Delete the conversation (AppContext will handle storage sync)
      deleteConversation(conversationToDelete);

      frontendLogger.info('Conversation deleted successfully', {
        metadata: {
          conversationId: conversationToDelete,
        },
      });

      // If we deleted the active conversation, select another one
      if (activeConversation?.id === conversationToDelete) {
        // Find another conversation to select
        const remainingConversations = conversationsList.filter(
          (c) => c.id !== conversationToDelete
        );

        if (remainingConversations.length > 0) {
          setActiveConversation(remainingConversations[0].id);
        } else {
          setActiveConversation(null);
        }
      }

      // TODO: Show success message to user

      // Close dialog
      handleDeleteCancel();
    } catch (error) {
      frontendLogger.error('Failed to delete conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { conversationId: conversationToDelete },
      });

      // TODO: Show error message to user
    }
  };

  const handleNewConversation = async (): Promise<void> => {
    // Prevent multiple simultaneous creation requests
    if (isCreatingConversation) {
      return;
    }

    try {
      setIsCreatingConversation(true);

      frontendLogger.info('Sidebar new conversation requested', {
        metadata: {
          location: 'Sidebar',
        },
      });

      const activeSessionId =
        session?.sessionId ?? sessionManagerRef.current.getSessionId();

      if (!activeSessionId) {
        frontendLogger.error(
          'Cannot create conversation without active session'
        );
        setIsCreatingConversation(false);
        return;
      }

      // Get default model from session preferences
      const defaultModel = session?.preferences.selectedModel || 'gpt-4o-mini';

      // Create new conversation via API
      const response = await createConversation({
        title: `New Conversation ${new Date().toLocaleString()}`,
        initialModel: defaultModel,
      });

      // Convert API response to Conversation type
      const newConversation: Conversation = {
        id: response.id,
        title: response.title,
        messages: [],
        selectedModel: response.model,
        createdAt: new Date(response.createdAt),
        updatedAt: new Date(response.updatedAt),
        sessionId: activeSessionId,
        isStreaming: false,
        modelHistory: [],
      };

      // Add conversation to state and storage
      await addConversation(newConversation);

      // Set as active conversation (this will trigger navigation)
      setActiveConversation(response.id);

      frontendLogger.info('New conversation created successfully', {
        metadata: {
          conversationId: response.id,
          title: response.title,
        },
      });

      // Close sidebar on mobile
      if (isMobile === true) {
        onClose();
      }
    } catch (error) {
      frontendLogger.error('Failed to create new conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // TODO: Show error message to user
      // For now, just log the error
    } finally {
      setIsCreatingConversation(false);
    }
  };

  // Handle list keyboard navigation
  const handleListKeyDown = (event: React.KeyboardEvent) => {
    const items = document.querySelectorAll(
      '.conversations-list .conversation-button'
    );
    if (items.length === 0) {
      return;
    }

    const currentElement = document.activeElement as HTMLElement;
    const currentIndex = Array.from(items).indexOf(currentElement);

    // If focus is on the container (ul), move to first item on navigation keys
    if (currentIndex === -1) {
      if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(
          event.key
        )
      ) {
        event.preventDefault();
        // Find the currently selected item or default to first
        const selected = document.querySelector(
          '.conversations-list .conversation-button.active'
        );
        if (selected) {
          (selected as HTMLElement).focus();
        } else {
          (items[0] as HTMLElement).focus();
        }
      }
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== currentIndex) {
      (items[nextIndex] as HTMLElement).focus();
    }
  };

  const sidebarClasses = [
    'sidebar',
    isOpen ? 'open' : 'closed',
    isMobile ? 'mobile' : 'desktop',
  ]
    .filter((value): value is string => value.length > 0)
    .join(' ');

  return (
    <aside
      ref={sidebarRef}
      id="sidebar"
      className={sidebarClasses}
      role="navigation"
      aria-label={t('sidebar.navigation')}
      aria-hidden={!isOpen}
      tabIndex={-1}
      data-testid="sidebar"
    >
      <div className="sidebar-content">
        {/* Sidebar header */}
        <div className="sidebar-header">
          <button
            type="button"
            className="new-conversation-button"
            onClick={handleNewConversation}
            disabled={isCreatingConversation}
            aria-label={t('sidebar.newConversation')}
            aria-busy={isCreatingConversation}
            data-testid="new-conversation-button"
          >
            <span className="new-conversation-icon">
              {isCreatingConversation ? '⏳' : '+'}
            </span>
            <span className="new-conversation-text">
              {isCreatingConversation
                ? t('sidebar.creatingConversation')
                : t('sidebar.newConversation')}
            </span>
          </button>

          {isMobile !== null && isMobile !== undefined && (
            <button
              type="button"
              className="sidebar-close"
              onClick={onClose}
              aria-label={t('sidebar.close')}
            >
              <span className="close-icon">×</span>
            </button>
          )}
        </div>

        {/* Search conversations */}
        <div
          className="conversations-search-section"
          data-testid="conversations-search-section"
        >
          <ConversationSearch
            onResultSelect={(conversationId) => {
              setActiveConversation(conversationId);
              if (isMobile) {
                onClose();
              }
            }}
          />
        </div>

        {/* Conversations list */}
        <div className="conversations-section">
          <h2 className="conversations-title">{t('sidebar.conversations')}</h2>

          {conversationsList.length === 0 ? (
            <div className="empty-conversations">
              <div className="empty-icon">💬</div>
              <p className="empty-text">{t('sidebar.noConversations')}</p>
              <p className="empty-hint">
                {t('sidebar.startFirstConversation')}
              </p>
            </div>
          ) : (
            <div
              className="conversations-list conversation-list"
              data-testid="conversations-list"
              role="listbox"
              aria-label={t('sidebar.conversations')}
              onKeyDown={handleListKeyDown}
              tabIndex={0}
            >
              {conversationsList.map(
                (conversation: Conversation, index: number) => {
                  const isActive = activeConversation?.id === conversation.id;
                  const isMenuOpen = menuOpen === conversation.id;

                  return (
                    <div
                      key={conversation.id}
                      className="conversation-item"
                      data-testid={`conversation-item-${conversation.id}`}
                      role="presentation"
                    >
                      <button
                        type="button"
                        className={[
                          'conversation-button',
                          isActive ? 'active' : '',
                        ]
                          .filter((value): value is string => value.length > 0)
                          .join(' ')}
                        onClick={() =>
                          handleConversationSelect(conversation.id)
                        }
                        aria-label={t('sidebar.selectConversation', {
                          title: conversation.title,
                        })}
                        aria-selected={isActive}
                        role="option"
                        tabIndex={
                          isActive ||
                          (activeConversation === null && index === 0)
                            ? 0
                            : -1
                        }
                        data-testid={`conversation-button-${conversation.id}`}
                        onKeyDown={(event) =>
                          handleConversationMenuKeyDown(event, conversation.id)
                        }
                        onContextMenu={(event) =>
                          handleConversationContextMenu(event, conversation.id)
                        }
                      >
                        <div className="conversation-content">
                          {renamingId === conversation.id ? (
                            <input
                              ref={renameInputRef}
                              type="text"
                              className="conversation-title-input"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() =>
                                void handleRenameSave(conversation.id)
                              }
                              onKeyDown={(e) =>
                                handleRenameKeyDown(e, conversation.id)
                              }
                              onClick={(e) => e.stopPropagation()}
                              maxLength={100}
                              aria-label={t('sidebar.renameConversation')}
                              data-testid="conversation-title-input"
                            />
                          ) : (
                            <div
                              className="conversation-title"
                              data-testid={`conversation-title-${conversation.id}`}
                            >
                              {conversation.title}
                            </div>
                          )}
                          <div className="conversation-meta">
                            <span className="conversation-model">
                              {conversation.selectedModel}
                            </span>
                            <span className="conversation-time">
                              {formatRelativeTime(conversation.updatedAt)}
                            </span>
                          </div>
                          {conversation.messages.length > 0 && (
                            <div className="conversation-preview">
                              {conversation.messages[
                                conversation.messages.length - 1
                              ].content.substring(0, 60)}
                              {conversation.messages[
                                conversation.messages.length - 1
                              ].content.length > 60
                                ? '...'
                                : ''}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Conversation actions - moved outside button to fix HTML nesting */}
                      <div
                        className={`conversation-actions ${isMenuOpen ? 'open' : ''}`}
                      >
                        <button
                          type="button"
                          className="conversation-action"
                          onClick={(event) =>
                            handleOptionsClick(event, conversation.id)
                          }
                          aria-label={t('sidebar.conversationOptions')}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          aria-hidden="true"
                          tabIndex={-1}
                          data-testid={`conversation-options-${conversation.id}`}
                        >
                          <span className="action-icon">⋯</span>
                        </button>

                        {/* Dropdown menu */}
                        {isMenuOpen && (
                          <DropdownMenu
                            isOpen={true}
                            onClose={handleMenuClose}
                            anchorElement={menuAnchor}
                            items={[
                              {
                                id: 'rename',
                                label: t('sidebar.renameConversation'),
                                icon: '✏️',
                                onClick: () => {
                                  handleRenameStart(conversation);
                                },
                              },
                              {
                                id: 'delete',
                                label: t('sidebar.deleteConversation'),
                                icon: '🗑️',
                                variant: 'danger',
                                onClick: () => {
                                  handleDeleteStart(conversation.id);
                                },
                              },
                            ]}
                            position="bottom-right"
                          />
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="sidebar-footer">
          <div className="session-info">
            <div className="session-label">{t('sidebar.session')}</div>
            <div
              className="session-id"
              title={isNonEmptyString(sessionId) ? sessionId : ''}
            >
              {isNonEmptyString(sessionId)
                ? `${sessionId.substring(0, 8)}...`
                : 'N/A'}
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              type="button"
              className="sidebar-action"
              aria-label={t('sidebar.settings')}
              title={t('sidebar.settings')}
            >
              <span className="action-icon">⚙️</span>
            </button>

            <button
              type="button"
              className="sidebar-action"
              aria-label={t('sidebar.help')}
              title={t('sidebar.help')}
            >
              <span className="action-icon">❓</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title={t('sidebar.confirmDelete')}
        message={t('sidebar.confirmDeleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        variant="danger"
      />
    </aside>
  );
}
