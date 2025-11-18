/**
 * App Navigation Hook
 * Moved from AppRouter to avoid Fast Refresh issues
 */

export interface AppNavigation {
  readonly navigate: (path: string) => void;
  readonly navigateToChat: (conversationId?: string) => void;
  readonly navigateToSettings: () => void;
  readonly goBack: () => void;
  readonly goForward: () => void;
}

export function useAppNavigation(): AppNavigation {
  const navigate = (path: string): void => {
    window.location.href = path;
  };

  const navigateToChat = (conversationId?: string): void => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      navigate(`/chat/${conversationId}`);
    } else {
      navigate('/chat');
    }
  };

  const navigateToSettings = (): void => {
    navigate('/settings');
  };

  const goBack = (): void => {
    window.history.back();
  };

  const goForward = (): void => {
    window.history.forward();
  };

  return {
    navigate,
    navigateToChat,
    navigateToSettings,
    goBack,
    goForward,
  };
}
