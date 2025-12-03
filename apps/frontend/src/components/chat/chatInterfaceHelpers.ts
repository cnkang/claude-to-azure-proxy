/**
 * Helper functions for ChatInterface component
 * Extracted to reduce cognitive complexity
 */

import type { Message } from '../../types/index.js';

/**
 * Count keyword occurrences in a single message
 */
export const countKeywordsInMessage = (
  message: Message | Partial<Message>,
  keywords: string[]
): number => {
  const content = message.content?.toLowerCase() || '';
  let count = 0;

  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    let position = content.indexOf(keywordLower);

    while (position !== -1) {
      count++;
      position = content.indexOf(keywordLower, position + keyword.length);
    }
  }

  return count;
};

/**
 * Calculate total keyword occurrences across all messages
 */
export const calculateTotalOccurrences = (
  messages: Message[],
  streamingMessage: Partial<Message> | undefined,
  keywords: string[]
): number => {
  const allMessages = [...messages];
  if (streamingMessage) {
    allMessages.push(streamingMessage as Message);
  }

  return allMessages.reduce(
    (total, message) => total + countKeywordsInMessage(message, keywords),
    0
  );
};

/**
 * Calculate the next occurrence index based on direction
 */
export const calculateNextIndex = (
  currentIndex: number,
  totalOccurrences: number,
  direction: 'next' | 'previous'
): number => {
  if (direction === 'next') {
    return currentIndex < totalOccurrences ? currentIndex + 1 : 1;
  }
  return currentIndex > 1 ? currentIndex - 1 : totalOccurrences;
};

/**
 * Scroll to a specific highlight element
 */
export const scrollToHighlight = (
  container: HTMLElement,
  index: number
): HTMLElement | null => {
  const allHighlights = container.querySelectorAll('.keyword-highlight');
  const targetHighlight = allHighlights[index - 1] as HTMLElement | undefined;

  if (targetHighlight) {
    targetHighlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    // Add temporary focus indicator
    targetHighlight.classList.add('keyword-highlight-active');
    setTimeout(() => {
      targetHighlight.classList.remove('keyword-highlight-active');
    }, 2000);

    return targetHighlight;
  }

  return null;
};

/**
 * Update conversation messages with retry flag
 */
export const updateMessageRetryFlag = (
  messages: Message[],
  messageId: string,
  retryable: boolean
): Message[] => {
  return messages.map((msg) =>
    msg.id === messageId ? { ...msg, retryable } : msg
  );
};

/**
 * Convert FileInfo to File objects for retry
 * Note: This is a limitation - we lose the actual file data
 */
export const convertFileInfoToFiles = (
  fileInfos: Array<{ name: string; type: string }> | undefined
): File[] | undefined => {
  return fileInfos?.map(
    (fileInfo) => new File([], fileInfo.name, { type: fileInfo.type })
  );
};
