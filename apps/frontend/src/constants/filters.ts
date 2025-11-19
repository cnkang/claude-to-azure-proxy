/**
 * Conversation filter constants
 */

import type { ConversationFilters } from '../types/index.js';

export const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
  searchQuery: '',
  model: undefined,
  dateRange: undefined,
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};
