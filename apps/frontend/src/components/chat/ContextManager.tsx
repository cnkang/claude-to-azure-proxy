/**
 * Context Manager Component
 * 
 * Integrates context management features into the chat interface,
 * including context warnings, extension, and compression functionality.
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import React, { useCallback } from 'react';
import type { Conversation } from '../../types/index';
import { useContextManagement, useContextCompression } from '../../hooks/useContextManagement';
import { ContextWarning, ContextUsageIndicator } from './ContextWarning';
import { ContextCompressionDialog } from './ContextCompressionDialog';
import { frontendLogger } from '../../utils/logger';

export interface ContextManagerProps {
  conversation: Conversation;
  onConversationSwitch?: (conversationId: string) => void;
  className?: string;
}

/**
 * Context manager component that handles all context-related functionality
 */
export const ContextManager: React.FC<ContextManagerProps> = ({
  conversation,
  onConversationSwitch,
  className = '',
}) => {
  const {
    contextUsage,
    state,
    getContextWarningLevel,
    canExtendContext,
    extendContext,
    showContextWarning,
    setShowContextWarning,
    dismissWarning,
  } = useContextManagement(conversation);

  const {
    compressionResult,
    showCompressionDialog,
    isCompressing,
    startCompression,
    confirmCompression,
    cancelCompression,
  } = useContextCompression(conversation);

  const warningLevel = getContextWarningLevel(contextUsage);
  const shouldShowWarning = showContextWarning && warningLevel !== 'none';

  const handleExtendContext = useCallback((): void => {
    extendContext()
      .then((result) => {
        if (result.success) {
          setShowContextWarning(false);
        }
      })
      .catch((error) => {
        frontendLogger.error('Failed to extend context', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
  }, [extendContext, setShowContextWarning]);

  const handleCompressContext = useCallback((): void => {
    startCompression().catch((error) => {
      frontendLogger.error('Failed to start compression', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }, [startCompression]);

  const handleCreateCompressed = useCallback(async (): Promise<void> => {
    try {
      const newConversationId = await confirmCompression();
      if (typeof newConversationId === 'string' && onConversationSwitch) {
        onConversationSwitch(newConversationId);
      }
    } catch (error) {
      frontendLogger.error('Failed to create compressed conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, [confirmCompression, onConversationSwitch]);

  const handleUsageIndicatorClick = useCallback((): void => {
    if (warningLevel !== 'none') {
      setShowContextWarning(true);
    }
  }, [warningLevel, setShowContextWarning]);

  return (
    <div className={`context-manager ${className}`}>
      {/* Context Usage Indicator */}
      <ContextUsageIndicator
        contextUsage={contextUsage}
        onClick={handleUsageIndicatorClick}
        className="context-manager__indicator"
      />

      {/* Context Warning */}
      {shouldShowWarning && (
        <ContextWarning
          contextUsage={contextUsage}
          warningLevel={warningLevel === 'critical' ? 'critical' : 'warning'}
          onExtendContext={handleExtendContext}
          onCompressContext={handleCompressContext}
          onDismiss={dismissWarning}
          isExtending={state.extensionInProgress}
          isCompressing={isCompressing}
          canExtend={canExtendContext(conversation.selectedModel)}
        />
      )}

      {/* Compression Dialog */}
      <ContextCompressionDialog
        isOpen={showCompressionDialog}
        onClose={cancelCompression}
        onConfirm={startCompression}
        onCreateCompressed={handleCreateCompressed}
        compressionResult={compressionResult}
        isCompressing={isCompressing}
        originalTokens={contextUsage.currentTokens}
        conversationTitle={conversation.title}
      />
    </div>
  );
};

/**
 * Compact context status component for headers/toolbars
 */
export interface ContextStatusProps {
  conversation: Conversation;
  onClick?: () => void;
  showLabel?: boolean;
  className?: string;
}

export const ContextStatus: React.FC<ContextStatusProps> = ({
  conversation,
  onClick,
  showLabel = false,
  className = '',
}) => {
  const { contextUsage, getContextUsagePercentage, formatTokenCount } = useContextManagement(conversation);
  
  const usagePercentage = getContextUsagePercentage(contextUsage);
  const isNearLimit = usagePercentage >= 80;
  
  return (
    <div className={`context-status ${className} ${isNearLimit ? 'context-status--warning' : ''}`}>
      <ContextUsageIndicator
        contextUsage={contextUsage}
        onClick={onClick}
      />
      {showLabel && (
        <span className="context-status__label">
          {formatTokenCount(contextUsage.currentTokens)} / {formatTokenCount(contextUsage.maxTokens)}
        </span>
      )}
    </div>
  );
};
