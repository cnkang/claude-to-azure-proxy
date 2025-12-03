/**
 * Integrity Check Initializer Component
 *
 * Runs data integrity check on application startup and displays warnings
 * if issues are found, offering automatic repair options.
 *
 * Requirements: 3.3, 5.5
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import type { IntegrityReport } from '../../services/data-integrity';
import { getDataIntegrityService } from '../../services/data-integrity.js';
import { getConversationStorage } from '../../services/storage.js';
import { frontendLogger } from '../../utils/logger';
import { Glass } from '../ui/Glass.js';
import { useNotifications } from './NotificationSystem';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-labelledby="integrity-dialog-title"
      aria-describedby="integrity-dialog-description"
    >
      <div
        className="absolute inset-0"
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
      <Glass
        className="relative w-full max-w-md flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
        intensity="high"
        border={true}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
          <h2
            id="integrity-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Data Integrity Check
          </h2>
        </div>

        <div
          id="integrity-dialog-description"
          className="p-6 space-y-4 bg-white dark:bg-gray-900"
        >
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Found{' '}
            {report.orphanedMessages +
              report.corruptedConversations +
              report.missingReferences}{' '}
            issues in your conversation data:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
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
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Would you like to automatically repair these issues?
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Dismiss dialog"
            data-testid="integrity-dismiss-button"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onRepair}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            aria-label="Repair data issues"
            data-testid="integrity-repair-button"
          >
            Repair Now
          </button>
        </div>
      </Glass>
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
        // Skip integrity check in E2E test mode
        const isE2ETestMode = Boolean(
          (window as { __E2E_TEST_MODE__?: boolean }).__E2E_TEST_MODE__
        );
        if (isE2ETestMode) {
          frontendLogger.info('Skipping integrity check in E2E test mode');
          return;
        }

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
