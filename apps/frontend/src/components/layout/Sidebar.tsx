/**
 * Sidebar Component
 * 
 * Navigation sidebar with conversation list, new conversation button,
 * and responsive behavior for mobile devices.
 * 
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React, { useEffect, useRef } from 'react';
import { isNonEmptyString } from '@repo/shared-utils';
import { useConversations } from '../../contexts/AppContext.js';
import { useI18n } from '../../contexts/I18nContext.js';
import { useSessionContext } from '../../contexts/SessionContext.js';
import { frontendLogger } from '../../utils/logger.js';
import type { Conversation } from '../../types/index.js';
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
export function Sidebar({ isOpen, isMobile, onClose }: SidebarProps): React.JSX.Element {
  const {
    activeConversation,
    conversationsList,
    setActiveConversation,
  } = useConversations();
  const { t, formatRelativeTime } = useI18n();
  const { session } = useSessionContext();
  const sidebarRef = useRef<HTMLElement>(null);
  const sessionId = session?.sessionId ?? '';

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

  const handleNewConversation = (): void => {
    // This will be implemented when we add conversation creation
    frontendLogger.info('Sidebar new conversation requested', {
      metadata: {
        location: 'Sidebar',
      },
    });
    
    // Close sidebar on mobile
    if (isMobile === true) {
      onClose();
    }
  };

  const sidebarClasses = [
    'sidebar',
    isOpen ? 'open' : 'closed',
    isMobile ? 'mobile' : 'desktop',
  ].filter((value): value is string => value.length > 0).join(' ');

  return (
    <aside
      ref={sidebarRef}
      id="sidebar"
      className={sidebarClasses}
      role="navigation"
      aria-label={t('sidebar.navigation')}
      aria-hidden={!isOpen}
      tabIndex={-1}
    >
      <div className="sidebar-content">
        {/* Sidebar header */}
        <div className="sidebar-header">
          <button
            type="button"
            className="new-conversation-button"
            onClick={handleNewConversation}
            aria-label={t('sidebar.newConversation')}
          >
            <span className="new-conversation-icon">+</span>
            <span className="new-conversation-text">
              {t('sidebar.newConversation')}
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

        {/* Conversations list */}
        <div className="conversations-section">
          <h2 className="conversations-title">
            {t('sidebar.conversations')}
          </h2>

          {conversationsList.length === 0 ? (
            <div className="empty-conversations">
              <div className="empty-icon">💬</div>
              <p className="empty-text">
                {t('sidebar.noConversations')}
              </p>
              <p className="empty-hint">
                {t('sidebar.startFirstConversation')}
              </p>
            </div>
          ) : (
            <ul className="conversations-list">
              {conversationsList.map((conversation: Conversation) => {
                const isActive = activeConversation?.id === conversation.id;

                return (
                  <li key={conversation.id} className="conversation-item">
                    <button
                      type="button"
                      className={['conversation-button', isActive ? 'active' : ''].filter((value): value is string => value.length > 0).join(' ')}
                      onClick={() => handleConversationSelect(conversation.id)}
                      aria-label={t('sidebar.selectConversation', { title: conversation.title })}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <div className="conversation-content">
                        <div className="conversation-title">
                          {conversation.title}
                        </div>
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
                            {conversation.messages[conversation.messages.length - 1].content.substring(0, 60)}
                            {conversation.messages[conversation.messages.length - 1].content.length > 60 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      
                      {/* Conversation actions */}
                      <div className="conversation-actions">
                        <button
                          type="button"
                          className="conversation-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            frontendLogger.info('Sidebar conversation options opened', {
                              metadata: {
                                conversationId: conversation.id,
                              },
                            });
                          }}
                          aria-label={t('sidebar.conversationOptions')}
                        >
                          <span className="action-icon">⋯</span>
                        </button>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="sidebar-footer">
          <div className="session-info">
            <div className="session-label">
              {t('sidebar.session')}
            </div>
            <div className="session-id" title={isNonEmptyString(sessionId) ? sessionId : ''}>
              {isNonEmptyString(sessionId) ? `${sessionId.substring(0, 8)}...` : 'N/A'}
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
    </aside>
  );
}
