/**
 * Chat Page Component
 *
 * Main chat interface page with conversation display and message input.
 * This is the primary page of the application.
 *
 * Requirements: 1.1, 5.1, 5.2, 5.3, 10.1
 */

import React, { useEffect, useState } from 'react';
import { useConversations } from '../hooks/useConversations.js';
import { useI18n } from '../contexts/I18nContext';
import { LayoutContainer } from '../components/layout/AppLayout';
import { ChatInterface } from '../components/chat/ChatInterface';
import { getModelService } from '../services/models';
import type { ClientConfig, Conversation } from '../types/index';

/**
 * Chat page component
 */
function ChatPage(): React.JSX.Element {
  const {
    activeConversation,
    activeConversationId,
    conversations,
    createConversation,
  } = useConversations();
  const { t } = useI18n();
  const [config, setConfig] = useState<ClientConfig | null>(null);

  // Cache the active conversation to prevent flickering during updates
  // This handles the case where activeConversation becomes null briefly during a sync update
  // but activeConversationId is still set.
  const [cachedConversation, setCachedConversation] =
    useState<Conversation | null>(null);

  useEffect(() => {
    if (activeConversation) {
      setCachedConversation(activeConversation);
    } else if (activeConversationId === null) {
      // Only clear cache if explicitly deselected
      setCachedConversation(null);
    }
  }, [activeConversation, activeConversationId]);

  // Use cached conversation if active is temporarily null but ID matches
  const displayConversation =
    activeConversation ||
    (activeConversationId && cachedConversation?.id === activeConversationId
      ? cachedConversation
      : null);

  const hasActiveConversation = displayConversation !== null;
  const hasNoConversations = conversations.length === 0;

  /**
   * Load client configuration
   */
  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const modelService = getModelService();
        const clientConfig = await modelService.fetchConfig();
        setConfig(clientConfig);
      } catch (_error) {
        // console.error('Failed to load client config:', error);
        // Use default config as fallback
        setConfig({
          maxFileSize: 10 * 1024 * 1024, // 10MB
          supportedFileTypes: ['.txt', '.md', '.js', '.ts', '.py', '.java'],
          availableModels: [],
          features: {
            fileUpload: true,
            imageUpload: false,
            codeHighlighting: true,
            streamingResponses: true,
          },
          maxConversations: 100,
          maxMessagesPerConversation: 1000,
          defaultModel: 'gpt-4',
          modelCategories: {
            general: ['gpt-4'],
            coding: [],
            reasoning: [],
          },
        });
      }
    };

    loadConfig();
  }, []);

  /**
   * Handle starting a new conversation
   */
  const handleStartNewConversation = (): void => {
    createConversation();
  };

  // Show loading if config is not loaded yet
  if (!config) {
    return (
      <LayoutContainer className="chat-page" maxWidth="full" padding="none">
        <div className="loading-screen">
          <div className="loading-content">
            <div className="loading-spinner">⏳</div>
            <p className="loading-text">{t('common.loading')}</p>
          </div>
        </div>
      </LayoutContainer>
    );
  }

  return (
    <LayoutContainer className="chat-page" maxWidth="full" padding="none">
      {hasActiveConversation && displayConversation !== null ? (
        <ChatInterface conversation={displayConversation} config={config} />
      ) : hasNoConversations ? (
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="welcome-icon">🤖</div>
            <h1 className="welcome-title">{t('welcome.title')}</h1>
            <p className="welcome-description">{t('welcome.description')}</p>
            <button
              type="button"
              className="welcome-button"
              onClick={handleStartNewConversation}
            >
              {t('welcome.startChat')}
            </button>
          </div>
        </div>
      ) : (
        <div className="no-conversation-selected">
          <div className="no-conversation-content">
            <div className="no-conversation-icon">💭</div>
            <h2 className="no-conversation-title">
              {t('chat.noConversationSelected')}
            </h2>
            <p className="no-conversation-description">
              {t('chat.selectConversationHint')}
            </p>
          </div>
        </div>
      )}
    </LayoutContainer>
  );
}

export default ChatPage;
