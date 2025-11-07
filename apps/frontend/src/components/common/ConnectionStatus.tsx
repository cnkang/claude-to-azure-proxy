/**
 * Connection Status Component
 *
 * Displays real-time connection status for SSE and network connectivity
 * with user-friendly indicators and retry options.
 *
 * Requirements: 6.3, 7.3
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SSEConnectionState, ConnectionHealth } from '../../services/chat';
import { networkUtils } from '../../utils/networkErrorHandler';
import { useNotifications } from './NotificationSystem';

/**
 * Connection status props
 */
interface ConnectionStatusProps {
  connectionState: SSEConnectionState;
  connectionHealth?: ConnectionHealth;
  onRetry?: () => void;
  className?: string;
  showDetails?: boolean;
}

/**
 * Connection status component
 */
export function ConnectionStatus({
  connectionState,
  connectionHealth,
  onRetry,
  className = '',
  showDetails = false,
}: ConnectionStatusProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { showWarning, showError } = useNotifications();
  const [isOnline, setIsOnline] = useState(networkUtils.isOnline());
  const [showDetailedStatus, setShowDetailedStatus] = useState(showDetails);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Show notifications for connection issues
  useEffect(() => {
    if (!isOnline) {
      showWarning(t('error.network.connectionFailed'), {
        persistent: true,
        actions: [
          {
            label: t('common.retry'),
            action: () => {
              if (networkUtils.isOnline()) {
                onRetry?.();
              }
            },
          },
        ],
      });
    }
  }, [isOnline, showWarning, t, onRetry]);

  // Show error for failed connections
  useEffect(() => {
    if (connectionState === 'error' && connectionHealth) {
      if (
        connectionHealth.reconnectAttempts >=
        connectionHealth.maxReconnectAttempts
      ) {
        showError(t('error.sse.maxAttemptsReached'), {
          persistent: true,
          actions: [
            {
              label: t('error.sse.retryManually'),
              action: () => window.location.reload(),
              primary: true,
            },
          ],
        });
      }
    }
  }, [connectionState, connectionHealth, showError, t]);

  // Don't render if connected and online
  if (connectionState === 'connected' && isOnline && !showDetails) {
    return null;
  }

  const getStatusColor = (): string => {
    if (!isOnline) {
      return '#ef4444';
    } // Red for offline

    switch (connectionState) {
      case 'connected':
        return '#10b981'; // Green
      case 'connecting':
      case 'reconnecting':
        return '#f59e0b'; // Yellow
      case 'error':
      case 'disconnected':
        return '#ef4444'; // Red
      default:
        return '#6b7280'; // Gray
    }
  };

  const getStatusText = (): string => {
    if (!isOnline) {
      return t('error.network.connectionFailed');
    }

    switch (connectionState) {
      case 'connected':
        return t('chat.connected');
      case 'connecting':
        return t('chat.connecting');
      case 'reconnecting':
        return t('error.sse.reconnecting');
      case 'error':
        return t('error.sse.connectionLost');
      case 'disconnected':
        return t('chat.disconnected');
      default:
        return t('chat.unknown');
    }
  };

  const getStatusIcon = (): string => {
    if (!isOnline) {
      return '⚠️';
    }

    switch (connectionState) {
      case 'connected':
        return '🟢';
      case 'connecting':
      case 'reconnecting':
        return '🟡';
      case 'error':
      case 'disconnected':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const shouldShowRetry = (): boolean => {
    return (
      (connectionState === 'error' ||
        connectionState === 'disconnected' ||
        !isOnline) &&
      onRetry !== undefined
    );
  };

  const handleRetry = (): void => {
    if (networkUtils.isOnline()) {
      onRetry?.();
    } else {
      showWarning(t('error.network.connectionFailed'));
    }
  };

  const toggleDetails = (): void => {
    setShowDetailedStatus(!showDetailedStatus);
  };

  return (
    <div
      className={`connection-status ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#f9fafb',
        border: `1px solid ${getStatusColor()}`,
        borderRadius: '0.375rem',
        fontSize: '0.875rem',
        color: '#374151',
      }}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${getStatusText()}`}
    >
      <span style={{ fontSize: '1rem' }}>{getStatusIcon()}</span>

      <span style={{ fontWeight: '500' }}>{getStatusText()}</span>

      {connectionHealth && showDetailedStatus && (
        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
          ({connectionHealth.reconnectAttempts}/
          {connectionHealth.maxReconnectAttempts})
        </span>
      )}

      {shouldShowRetry() && (
        <button
          onClick={handleRetry}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            fontWeight: '500',
            backgroundColor: getStatusColor(),
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease-in-out',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onFocus={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onBlur={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {t('common.retry')}
        </button>
      )}

      {connectionHealth && (
        <button
          onClick={toggleDetails}
          style={{
            padding: '0.25rem',
            fontSize: '0.75rem',
            backgroundColor: 'transparent',
            color: '#6b7280',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '0.25rem',
          }}
          aria-label={showDetailedStatus ? 'Hide details' : 'Show details'}
        >
          {showDetailedStatus ? '▼' : '▶'}
        </button>
      )}

      {connectionHealth && showDetailedStatus && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            padding: '0.75rem',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            fontSize: '0.75rem',
            color: '#6b7280',
            zIndex: 10,
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Connection Health:</strong>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
            }}
          >
            <div>
              <div>State: {connectionHealth.state}</div>
              <div>Online: {connectionHealth.isOnline ? 'Yes' : 'No'}</div>
            </div>

            <div>
              <div>
                Attempts: {connectionHealth.reconnectAttempts}/
                {connectionHealth.maxReconnectAttempts}
              </div>
              {connectionHealth.lastConnected && (
                <div>
                  Last:{' '}
                  {new Intl.DateTimeFormat('en', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }).format(connectionHealth.lastConnected)}
                </div>
              )}
            </div>
          </div>

          {connectionHealth.nextReconnectDelay > 0 &&
            connectionHealth.state === 'reconnecting' && (
              <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                Next attempt in{' '}
                {Math.round(connectionHealth.nextReconnectDelay / 1000)}s
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple connection indicator for minimal UI
 */
interface ConnectionIndicatorProps {
  connectionState: SSEConnectionState;
  isOnline?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function ConnectionIndicator({
  connectionState,
  isOnline = true,
  size = 'medium',
  className = '',
}: ConnectionIndicatorProps): React.JSX.Element {
  const { t } = useTranslation();

  const getColor = (): string => {
    if (!isOnline) {
      return '#ef4444';
    }

    switch (connectionState) {
      case 'connected':
        return '#10b981';
      case 'connecting':
      case 'reconnecting':
        return '#f59e0b';
      case 'error':
      case 'disconnected':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getSize = (): string => {
    switch (size) {
      case 'small':
        return '0.5rem';
      case 'large':
        return '1rem';
      default:
        return '0.75rem';
    }
  };

  const getStatusText = (): string => {
    if (!isOnline) {
      return t('error.network.connectionFailed');
    }

    switch (connectionState) {
      case 'connected':
        return t('chat.connected');
      case 'connecting':
        return t('chat.connecting');
      case 'reconnecting':
        return t('error.sse.reconnecting');
      case 'error':
        return t('error.sse.connectionLost');
      case 'disconnected':
        return t('chat.disconnected');
      default:
        return t('chat.unknown');
    }
  };

  return (
    <div
      className={`connection-indicator ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
      }}
      title={getStatusText()}
      role="status"
      aria-label={getStatusText()}
    >
      <div
        style={{
          width: getSize(),
          height: getSize(),
          borderRadius: '50%',
          backgroundColor: getColor(),
          transition: 'background-color 0.2s ease-in-out',
        }}
      />

      {connectionState === 'connecting' ||
      connectionState === 'reconnecting' ? (
        <div
          style={{
            width: getSize(),
            height: getSize(),
            border: `2px solid ${getColor()}`,
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            position: 'absolute',
          }}
        />
      ) : null}
    </div>
  );
}

export default ConnectionStatus;
