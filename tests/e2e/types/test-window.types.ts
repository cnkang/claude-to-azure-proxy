export interface ConversationStorage {
  initialize?: () => Promise<void>;
  getStats?: () => Promise<{ conversations: number; messages: number }>;
  deleteConversation?: (conversationId: string) => Promise<void>;
  storeConversation?: (conversation: unknown) => Promise<void>;
}
