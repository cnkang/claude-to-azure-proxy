/**
 * Conversation List (compatibility wrapper)
 *
 * Provides a lightweight wrapper around the optimized conversation list
 * component to preserve the legacy component API used across the codebase.
 */

import React from 'react';
import { OptimizedConversationList } from './OptimizedConversationList.js';

export interface ConversationListProps {
  readonly className?: string;
  readonly onConversationSelect?: (conversationId: string) => void;
  readonly showSearch?: boolean;
  readonly compactMode?: boolean;
}

const ConversationListComponent = function ConversationList({
  className,
  onConversationSelect,
  showSearch = true,
  compactMode = false,
}: ConversationListProps): React.JSX.Element {
  return (
    <OptimizedConversationList
      className={className}
      onConversationSelect={onConversationSelect}
      enableVirtualScrolling={!compactMode}
      listHeight={compactMode ? 360 : 520}
      showSearch={showSearch}
    />
  );
};

export const ConversationList = React.memo(ConversationListComponent);
