/**
 * Integrity Check Initializer Component
 *
 * Runs data integrity check on application startup and displays warnings
 * if issues are found, offering automatic repair options.
 *
 * Requirements: 3.3, 5.5
 */

import React, { useEffect, useState } from 'react';
import { getConversationStorage } from '../../services/storage.js';
import { getDataIntegrityService } from '../../services/data-integrity.js';
import type { IntegrityReport } from '../../services/data-integrity';
import { useNotifications } from './NotificationSystem';
import { frontendLogger } from '../../utils/logger';
import './IntegrityCheckDialog.css';

/**
 * Dialog component for integrity check results
 */
interface IntegrityCheckDialogProps {
  report: IntegrityReport;
  onRepair: () => void;
  onDismiss: () => void;
}

function IntegrityCheckDialog({
  report,
  onRepair,
  onDismiss,
}: IntegrityCheckDialogProps): React.JSX.Element {
  return (
    <div
      className="integrity-check-dialog"
      role="dialog"
      aria-labelledby="integrity-dialog-title"
      aria-describedby="integrity-dialog-description"
    >
      <div
        className="integrity-dialog-overlay"
        onClick={onDismiss}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onDismiss();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
      />
      <div className="integrity-dialog-content">
        <h2 id="integrity-dialog-title">Data Integrity Check</h2>
        <div id="integrity-dialog-description">
          <p>
            Found {report.orphanedMessages + report.corruptedConversations +
              report.missingReferences}{' '}
            issues in your conversation data:
          </p>
          <ul>
            {report.orphanedMessages > 0 && (
              <li>{report.orphanedMessages} orphaned messages</li>
            )}
            {report.corruptedConversations > 0 && (
              <li>{report.corruptedConversations} corrupted conversations</li>
            )}
            {report.missingReferences > 0 && (
              <li>{report.missingReferences} missing references</li>
            )}
          </ul>
          <p>Would you like to automatically repair these issues?</p>
        </div>
        <div className="integrity-dialog-actions">
          <button
            onClick={onRepair}
            className="integrity-dialog-button primary"
            aria-label="Repair data issues"
          >
            Repair Now
          </button>
          <button
            onClick={onDismiss}
            className="integrity-dialog-button"
            aria-label="Dismiss dialog"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Integrity Check Initializer Component
 *
 * Runs integrity check on mount and displays results to user.
 *
 * Requirements:
 * - 3.3: Run integrity check on app startup
 * - 5.5: Display warnings if issues found
 * - 5.5: Offer automatic repair option via dialog
 * - 5.5: Log integrity check results
 */
export function IntegrityCheckInitializer(): React.JSX.Element | null {
  const [showDialog, setShowDialog] = useState(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const { showWarning, showSuccess, showError } = useNotifications();

  useEffect(() => {
    const runIntegrityCheck = async (): Promise<void> => {
      try {
        // Get storage instance
        const storage = getConversationStorage();
        await storage.initialize();

        // Create integrity service
        const integrityService = getDataIntegrityService(storage);

        // Run startup check
        frontendLogger.info('Running startup integrity check');
        const checkReport = await integrityService.runStartupCheck();

        // Log results
        frontendLogger.info('Integrity check completed', {
          metadata: {
            hasIssues: checkReport.hasIssues,
            orphanedMessages: checkReport.orphanedMessages,
            corruptedConversations: checkReport.corruptedConversations,
            missingReferences: checkReport.missingReferences,
            duration: checkReport.duration,
          },
        });

        // Show dialog if issues found
        if (checkReport.hasIssues) {
          setReport(checkReport);
          setShowDialog(true);

          // Also show a warning notification
          showWarning(
            `Found ${checkReport.orphanedMessages + checkReport.corruptedConversations + checkReport.missingReferences} data integrity issues. Click to review.`,
            {
              persistent: true,
              actions: [
                {
                  label: 'Review',
                  action: () => setShowDialog(true),
                  primary: true,
                },
              ],
            }
          );
        } else {
          frontendLogger.info('No integrity issues found');
        }
      } catch (error) {
        frontendLogger.error('Integrity check failed', {
          error: error instanceof Error ? error : new Error(String(error)),
        });

        showError(
          'Failed to run data integrity check. Some features may not work correctly.',
          {
            duration: 10000,
          }
        );
      }
    };

    runIntegrityCheck().catch(() => undefined);
  }, [showWarning, showError]);

  const handleRepair = async (): Promise<void> => {
    if (!report) {
      return;
    }

    try {
      const storage = getConversationStorage();
      const integrityService = getDataIntegrityService(storage);

      // Clean up orphaned messages
      if (report.orphanedMessages > 0) {
        frontendLogger.info('Cleaning up orphaned messages');
        const cleanupResult = await integrityService.cleanupOrphanedMessages();

        if (cleanupResult.success) {
          frontendLogger.info('Orphaned messages cleaned up', {
            metadata: {
              messagesRemoved: cleanupResult.messagesRemoved,
              bytesFreed: cleanupResult.bytesFreed,
            },
          });
        }
      }

      // Repair corrupted conversations
      if (report.corruptedConversations > 0) {
        frontendLogger.info('Repairing corrupted conversations');
        const repairResult =
          await integrityService.repairCorruptedConversations();

        if (repairResult.success) {
          frontendLogger.info('Corrupted conversations repaired', {
            metadata: {
              conversationsRepaired: repairResult.conversationsRepaired,
            },
          });
        }
      }

      // Show success message
      showSuccess('Data integrity issues have been repaired successfully.', {
        duration: 5000,
      });

      // Close dialog
      setShowDialog(false);
      setReport(null);
    } catch (error) {
      frontendLogger.error('Repair failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });

      showError(
        'Failed to repair data integrity issues. Please try again or contact support.',
        {
          duration: 10000,
        }
      );
    }
  };

  const handleDismiss = (): void => {
    setShowDialog(false);
  };

  if (!showDialog || !report) {
    return null;
  }

  return (
    <IntegrityCheckDialog
      report={report}
      onRepair={handleRepair}
      onDismiss={handleDismiss}
    />
  );
}

