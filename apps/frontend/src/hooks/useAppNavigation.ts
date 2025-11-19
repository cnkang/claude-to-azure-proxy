/**
 * App Navigation Hook
 * Moved from AppRouter to avoid Fast Refresh issues
 */

import { useNavigate } from 'react-router-dom';

export interface AppNavigation {
  readonly navigate: (path: string) => void;
  readonly navigateToChat: (conversationId?: string) => void;
  readonly navigateToSettings: () => void;
  readonly goBack: () => void;
  readonly goForward: () => void;
}

export function useAppNavigation(): AppNavigation {
  const navigate = useNavigate();

  const navigateToPath = (path: string): void => {
    navigate(path);
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
    navigate(-1);
  };

  const goForward = (): void => {
    navigate(1);
  };

  return {
    navigate: navigateToPath,
    navigateToChat,
    navigateToSettings,
    goBack,
    goForward,
  };
}
