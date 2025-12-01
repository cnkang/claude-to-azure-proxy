/**
 * Sidebar Component
 *
 * Navigation sidebar with conversation list, new conversation button,
 * and responsive behavior for mobile devices.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';
import { GlassSheetContent } from '../ui/GlassSheet';
import { Glass } from '../ui/Glass';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { useAccessibleAnimation, useAccessibleGestures } from '../../hooks/useAccessibleAnimation';

/**
 * Sidebar props
 */
export interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  isTablet?: boolean;
  isDesktop?: boolean;
  onClose: () => void;
}

/**
 * Sidebar component
 */
export function Sidebar({
  isOpen,
  isMobile,
  isTablet = false,
  isDesktop = false,
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
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sessionId = session?.sessionId ?? '';
  
  // Get accessible animation configuration
  const animation = useAccessibleAnimation('bouncy');
  const gestures = useAccessibleGestures();

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

    // Close sidebar on mobile/tablet after selection to show the conversation
    // Keep it open on desktop for better UX (side-by-side view)
    if (isMobile === true || isTablet === true) {
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

      // Close sidebar on mobile/tablet
      if (isMobile === true || isTablet === true) {
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

  // Sidebar inner content (the actual UI elements)
  const sidebarInnerContent = (
    <>
          {/* Sidebar header */}
          <div className="border-b border-white/10 flex items-center justify-between" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)', gap: '0.5rem' }}>
            <Button
              className="flex-1 flex items-center justify-center bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:opacity-70"
              onClick={handleNewConversation}
              disabled={isCreatingConversation}
              aria-label={t('sidebar.newConversation')}
              aria-busy={isCreatingConversation}
              data-testid="new-conversation-button"
              style={{ gap: '0.5rem' }}
              asChild
            >
              <motion.button
                type="button"
                transition={animation}
                {...gestures}
              >
                <motion.span 
                  className="text-xl leading-none"
                  animate={{ rotate: isCreatingConversation ? 360 : 0 }}
                  transition={{ duration: 1, repeat: isCreatingConversation ? Infinity : 0, ease: 'linear' }}
                >
                  {isCreatingConversation ? '⏳' : '+'}
                </motion.span>
                <span className="text-sm">
                  {isCreatingConversation
                    ? t('sidebar.creatingConversation')
                    : t('sidebar.newConversation')}
                </span>
              </motion.button>
            </Button>

            {(isMobile || isTablet) && (
              <motion.button
                type="button"
                onClick={onClose}
                aria-label={t('sidebar.close')}
                className="min-w-[44px] min-h-[44px] w-11 h-11 p-2 rounded-lg hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center"
                data-testid="sidebar-close-button"
                transition={animation}
                {...gestures}
              >
                <span className="text-xl leading-none">×</span>
              </motion.button>
            )}
          </div>

          {/* Search conversations */}
          <div
            data-testid="conversations-search-section"
            style={{ paddingInline: 'clamp(0.75rem, 2vw, 1rem)', paddingBlock: '0.5rem' }}
          >
            <ConversationSearch
              onResultSelect={(conversationId) => {
                setActiveConversation(conversationId);
                // Close sidebar on mobile/tablet after search result selection
                if (isMobile || isTablet) {
                  onClose();
                }
              }}
            />
          </div>

          {/* Conversations list */}
          <ScrollArea className="flex-1" style={{ paddingInline: 'clamp(0.5rem, 1.5vw, 0.75rem)', paddingBlock: '0.5rem' }}>
          <h2 className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            {t('sidebar.conversations')}
          </h2>

          {conversationsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center p-4 text-gray-700 dark:text-gray-300">
              <div className="text-4xl mb-3 opacity-50">💬</div>
              <p className="text-sm font-medium mb-1">{t('sidebar.noConversations')}</p>
              <p className="text-xs opacity-70">
                {t('sidebar.startFirstConversation')}
              </p>
            </div>
          ) : (
            <div
              className="conversations-list space-y-1"
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
                      className="group relative"
                      data-testid={`conversation-item-${conversation.id}`}
                      role="presentation"
                    >
                      <motion.button
                        type="button"
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all duration-200 group-hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
                          isActive 
                            ? "bg-white/10 dark:bg-white/5 shadow-sm border border-white/10" 
                            : "border border-transparent"
                        )}
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
                        transition={animation}
                        whileHover={{ scale: 1.01, x: 2 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="flex flex-col gap-1">
                          {renamingId === conversation.id ? (
                            <input
                              ref={renameInputRef}
                              type="text"
                              className="w-full bg-white/10 border border-blue-500/50 rounded px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                              className={cn(
                                "text-sm font-medium truncate pr-6",
                                isActive ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"
                              )}
                              data-testid={`conversation-title-${conversation.id}`}
                            >
                              {conversation.title}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                            <span className="truncate max-w-[60%] opacity-80">
                              {conversation.selectedModel}
                            </span>
                            <span className="opacity-60">
                              {formatRelativeTime(conversation.updatedAt)}
                            </span>
                          </div>
                          {conversation.messages.length > 0 && (
                            <div className="text-xs text-gray-700 dark:text-gray-300 truncate mt-0.5 opacity-70">
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
                      </motion.button>

                      {/* Conversation actions */}
                      <div
                        className={cn(
                          "absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                          (isMenuOpen || isActive) && "opacity-100"
                        )}
                      >
                        <motion.button
                          type="button"
                          className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-700/50 text-gray-700 transition-colors"
                          onClick={(event) =>
                            handleOptionsClick(event, conversation.id)
                          }
                          transition={animation}
                          {...gestures}
                          aria-label={t('sidebar.conversationOptions')}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          aria-hidden="true"
                          tabIndex={-1}
                          data-testid={`conversation-options-${conversation.id}`}
                        >
                          <span className="text-lg leading-none">⋯</span>
                        </motion.button>
                      </div>

                      {/* Dropdown menu */}
                      {isMenuOpen && menuOpen === conversation.id && (
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
                  );
                }
              )}
            </div>
          )}
          </ScrollArea>

          {/* Sidebar footer */}
          <div className="border-t border-white/10 bg-white/5 backdrop-blur-sm" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
            <div className="flex flex-col" style={{ gap: 'clamp(0.5rem, 1.5vw, 0.75rem)' }}>
              <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                <div className="font-medium">{t('sidebar.session')}</div>
                <div
                  className="font-mono bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded"
                  title={isNonEmptyString(sessionId) ? sessionId : ''}
                >
                  {isNonEmptyString(sessionId)
                    ? `${sessionId.substring(0, 8)}...`
                    : 'N/A'}
                </div>
              </div>

              <div className="flex" style={{ gap: '0.5rem' }}>
                <Button
                  variant="outline"
                  size="default"
                  className="flex-1 bg-white/5 hover:bg-white/10 border-white/10 text-gray-700 dark:text-gray-300"
                  aria-label={t('sidebar.settings')}
                  title={t('sidebar.settings')}
                >
                  <span className="text-base">⚙️</span>
                </Button>

                <Button
                  variant="outline"
                  size="default"
                  className="flex-1 bg-white/5 hover:bg-white/10 border-white/10 text-gray-700 dark:text-gray-300"
                  aria-label={t('sidebar.help')}
                  title={t('sidebar.help')}
                >
                  <span className="text-base">❓</span>
                </Button>
              </div>
            </div>
          </div>
    </>
  );

  // Desktop: Static sidebar with flex layout
  if (isDesktop) {
    return (
      <>
        <aside
          ref={sidebarRef}
          id="sidebar"
          className={cn(
            "h-full border-r border-white/10 transition-all duration-300 overflow-hidden",
            isOpen ? "w-80" : "w-0"
          )}
          data-testid="sidebar"
          role="navigation"
          aria-label={t('sidebar.navigation')}
          aria-hidden={!isOpen}
          inert={!isOpen ? true : undefined}
          style={{
            height: '100dvh',
          }}
        >
          <Glass
            intensity="high"
            border={false}
            className="h-full flex flex-col rounded-none p-0"
            style={{
              gap: 'clamp(0.5rem, 1.5vw, 1rem)',
            }}
          >
            {sidebarInnerContent}
          </Glass>
        </aside>

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
      </>
    );
  }

  // Mobile/Tablet: Sheet modal with overlay
  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          ref={sidebarRef}
          side="left"
          id="sidebar-sheet"
          className="w-80 p-0"
          data-testid="sidebar"
          role="navigation"
          aria-label={t('sidebar.navigation')}
          aria-hidden={!isOpen}
          inert={!isOpen ? true : undefined}
          style={{
            height: '100dvh',
          }}
        >
          {/* Hidden title for accessibility */}
          <SheetTitle className="sr-only">{t('sidebar.navigation')}</SheetTitle>
          
          <div className="h-full" inert={!isOpen ? true : undefined}>
            <GlassSheetContent 
              intensity="high"
              border={true}
              className="h-full flex flex-col rounded-none border-y-0 border-l-0 p-0"
              style={{
                gap: 'clamp(0.5rem, 1.5vw, 1rem)',
              }}
            >
              {sidebarInnerContent}
            </GlassSheetContent>
          </div>
        </SheetContent>
      </Sheet>

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
    </>
  );
}
