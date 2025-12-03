/**
 * Notification System Component
 *
 * Provides user-friendly notifications for errors, success messages,
 * and other important information with i18n support.
 *
 * Requirements: 6.3, 7.3
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { NetworkError } from '../../utils/networkErrorHandler';

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification interface
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
}

/**
 * Notification action interface
 */
export interface NotificationAction {
  label: string;
  action: () => void;
  primary?: boolean;
}

/**
 * Notification context interface
 */
interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  showError: (
    _error: Error | NetworkError | string,
    options?: Partial<Notification>
  ) => string;
  showSuccess: (message: string, options?: Partial<Notification>) => string;
  showWarning: (message: string, options?: Partial<Notification>) => string;
  showInfo: (message: string, options?: Partial<Notification>) => string;
}

/**
 * Notification context
 */
const NotificationContext = createContext<NotificationContextType | null>(null);

/**
 * Notification provider props
 */
interface NotificationProviderProps {
  children: React.ReactNode;
  maxNotifications?: number;
  defaultDuration?: number;
}

/**
 * Notification provider component
 */
export function NotificationProvider({
  children,
  maxNotifications = 5,
  defaultDuration = 5000,
}: NotificationProviderProps): React.JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { t } = useTranslation();

  /**
   * Add notification
   */
  const removeNotification = useCallback((id: string): void => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id'>): string => {
      const id = crypto.randomUUID();
      const newNotification: Notification = {
        ...notification,
        id,
        duration: notification.duration ?? defaultDuration,
      };

      setNotifications((prev) => {
        const updated = [newNotification, ...prev];
        // Limit number of notifications
        return updated.slice(0, maxNotifications);
      });

      // Auto-remove notification after duration
      if (
        !newNotification.persistent &&
        newNotification.duration &&
        newNotification.duration > 0
      ) {
        setTimeout(() => {
          removeNotification(id);
        }, newNotification.duration);
      }

      return id;
    },
    [maxNotifications, defaultDuration, removeNotification]
  );

  /**
   * Clear all notifications
   */
  const clearAllNotifications = useCallback((): void => {
    setNotifications([]);
  }, []);

  /**
   * Show error notification
   */
  const showError = useCallback(
    (
      error: Error | NetworkError | string,
      options: Partial<Notification> = {}
    ): string => {
      let title: string;
      let message: string;
      let actions: NotificationAction[] | undefined;

      if (error instanceof NetworkError) {
        title = t('error.network.title');
        message = t(`error.network.${error.type}`, {
          defaultValue: error.message,
        });

        // Add retry action for retryable errors
        if (error.retryable) {
          actions = [
            {
              label: t('common.retry'),
              action: () => {
                // Emit retry event that components can listen to
                window.dispatchEvent(
                  new CustomEvent('notification-retry', {
                    detail: { errorId: error.correlationId, error },
                  })
                );
              },
              primary: true,
            },
          ];
        }
      } else if (error instanceof Error) {
        title = t('error.general.title');
        message = error.message;
      } else {
        title = t('error.general.title');
        message = String(error);
      }

      return addNotification({
        type: 'error',
        title,
        message,
        actions,
        persistent: true, // Errors should be persistent
        ...options,
      });
    },
    [t, addNotification]
  );

  /**
   * Show success notification
   */
  const showSuccess = useCallback(
    (message: string, options: Partial<Notification> = {}): string => {
      return addNotification({
        type: 'success',
        title: t('common.success'),
        message,
        ...options,
      });
    },
    [t, addNotification]
  );

  /**
   * Show warning notification
   */
  const showWarning = useCallback(
    (message: string, options: Partial<Notification> = {}): string => {
      return addNotification({
        type: 'warning',
        title: t('common.warning'),
        message,
        duration: 8000, // Longer duration for warnings
        ...options,
      });
    },
    [t, addNotification]
  );

  /**
   * Show info notification
   */
  const showInfo = useCallback(
    (message: string, options: Partial<Notification> = {}): string => {
      return addNotification({
        type: 'info',
        title: t('common.info'),
        message,
        ...options,
      });
    },
    [t, addNotification]
  );

  const contextValue: NotificationContextType = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showError,
    showSuccess,
    showWarning,
    showInfo,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

/**
 * Notification container component
 */
function NotificationContainer(): React.JSX.Element {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'NotificationContainer must be used within NotificationProvider'
    );
  }

  const { notifications } = context;

  return (
    <div
      className="notification-container"
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        maxWidth: '400px',
        pointerEvents: 'none',
      }}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

/**
 * Individual notification item component
 */
interface NotificationItemProps {
  notification: Notification;
}

function NotificationItem({
  notification,
}: NotificationItemProps): React.JSX.Element {
  const context = useContext(NotificationContext);
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  if (!context) {
    throw new Error(
      'NotificationItem must be used within NotificationProvider'
    );
  }

  const { removeNotification } = context;

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = (): void => {
    setIsVisible(false);
    setTimeout(() => removeNotification(notification.id), 200);
  };

  const getNotificationStyles = () => {
    const baseStyles = {
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow:
        '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      pointerEvents: 'auto' as const,
      transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
      opacity: isVisible ? 1 : 0,
      transition: 'all 0.2s ease-in-out',
      maxWidth: '100%',
      wordBreak: 'break-word' as const,
    };

    const typeStyles = {
      success: { borderLeftColor: '#10b981', borderLeftWidth: '4px' },
      error: { borderLeftColor: '#ef4444', borderLeftWidth: '4px' },
      warning: { borderLeftColor: '#92400e', borderLeftWidth: '4px' },
      info: { borderLeftColor: '#3b82f6', borderLeftWidth: '4px' },
    };

    return { ...baseStyles, ...typeStyles[notification.type] };
  };

  const getIconColor = () => {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#92400e',
      info: '#3b82f6',
    };
    return colors[notification.type];
  };

  const getIcon = () => {
    const iconStyle = { color: getIconColor(), marginRight: '0.5rem' };

    switch (notification.type) {
      case 'success':
        return <span style={iconStyle}>✓</span>;
      case 'error':
        return <span style={iconStyle}>✕</span>;
      case 'warning':
        return <span style={iconStyle}>⚠</span>;
      case 'info':
        return <span style={iconStyle}>ℹ</span>;
    }
  };

  return (
    <div style={getNotificationStyles()} role="alert" aria-live="assertive">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}
          >
            {getIcon()}
            {notification.title && (
              <div
                role="heading"
                aria-level={2}
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                {notification.title}
              </div>
            )}
          </div>

          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              color: '#1f2937',
              lineHeight: '1.4',
            }}
          >
            {notification.message}
          </p>

          {notification.actions && notification.actions.length > 0 && (
            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              {notification.actions.map((action) => (
                <button
                  key={`${notification.id}-${action.label}`}
                  type="button"
                  onClick={action.action}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    border: action.primary ? 'none' : '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    backgroundColor: action.primary
                      ? getIconColor()
                      : 'transparent',
                    color: action.primary ? 'white' : '#111827',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                  onMouseOver={(e) => {
                    if (action.primary) {
                      e.currentTarget.style.opacity = '0.9';
                    } else {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (action.primary) {
                      e.currentTarget.style.opacity = '1';
                    } else {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  onFocus={(e) => {
                    if (action.primary) {
                      e.currentTarget.style.opacity = '0.9';
                    } else {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onBlur={(e) => {
                    if (action.primary) {
                      e.currentTarget.style.opacity = '1';
                    } else {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          style={{
            marginLeft: '0.5rem',
            padding: '0.25rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '1.25rem',
            lineHeight: 1,
            transition: 'color 0.15s ease-in-out',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = '#6b7280';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = '#9ca3af';
          }}
          onFocus={(e) => {
            e.currentTarget.style.color = '#6b7280';
          }}
          onBlur={(e) => {
            e.currentTarget.style.color = '#9ca3af';
          }}
          aria-label={t('accessibility.closeError')}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Hook to use notifications
 */
export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotifications must be used within NotificationProvider'
    );
  }
  return context;
}

/**
 * Hook for error handling with notifications
 */
export function useErrorNotification() {
  const { showError } = useNotifications();

  return useCallback(
    (error: Error | NetworkError | string, options?: Partial<Notification>) => {
      return showError(error, options);
    },
    [showError]
  );
}

export default NotificationProvider;
