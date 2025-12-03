/**
 * Conversation Manager Component
 *
 * Main component for conversation management that combines conversation list,
 * search, filtering, and organization features into a unified interface.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import {
  useConversationOrganization,
  useConversations,
} from '../../hooks/useConversations.js';
import { Glass, cn } from '../ui/Glass.js';
import { ConversationList } from './ConversationList.js';

/**
 * Conversation filter panel props
 */
interface ConversationFilterPanelProps {
  onClose: () => void;
}

/**
 * Conversation filter panel component
 */
function ConversationFilterPanel({
  onClose,
}: ConversationFilterPanelProps): React.JSX.Element {
  const { t } = useI18n();
  const { conversations } = useConversations();
  const {
    sortBy,
    sortOrder,
    setSorting,
    modelFilter,
    setModelFilter,
    dateRangeFilter,
    setDateRangeFilter,
    clearAllFilters,
  } = useConversationOrganization();

  // Get unique models from conversations
  const availableModels = useMemo(() => {
    const models = new Set(conversations.map((conv) => conv.selectedModel));
    return Array.from(models).sort();
  }, [conversations]);

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const [newSortBy, newSortOrder] = e.target.value.split('-') as [
        typeof sortBy,
        typeof sortOrder,
      ];
      setSorting(newSortBy, newSortOrder);
    },
    [setSorting]
  );

  const handleModelFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const value = e.target.value;
      setModelFilter(value === '' ? undefined : value);
    },
    [setModelFilter]
  );

  const handleDateRangeChange = useCallback(
    (field: 'start' | 'end', value: string): void => {
      const date = value ? new Date(value) : undefined;

      if (field === 'start') {
        setDateRangeFilter(
          date
            ? {
                start: date,
                end: dateRangeFilter?.end || new Date(),
              }
            : undefined
        );
      } else {
        setDateRangeFilter(
          dateRangeFilter?.start
            ? {
                start: dateRangeFilter.start,
                end: date || new Date(),
              }
            : undefined
        );
      }
    },
    [dateRangeFilter, setDateRangeFilter]
  );

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  return (
    <Glass intensity="low" border={true} className="p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">
          {t('conversation.filters')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
          aria-label={t('common.close')}
        >
          <span className="text-lg">✕</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="sort-select"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('conversation.sortBy')}
          </label>
          <select
            id="sort-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={handleSortChange}
            className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
          >
            <option value="updatedAt-desc">
              {t('conversation.sortUpdatedDesc')}
            </option>
            <option value="updatedAt-asc">
              {t('conversation.sortUpdatedAsc')}
            </option>
            <option value="createdAt-desc">
              {t('conversation.sortCreatedDesc')}
            </option>
            <option value="createdAt-asc">
              {t('conversation.sortCreatedAsc')}
            </option>
            <option value="title-asc">{t('conversation.sortTitleAsc')}</option>
            <option value="title-desc">
              {t('conversation.sortTitleDesc')}
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="model-filter"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('conversation.filterByModel')}
          </label>
          <select
            id="model-filter"
            value={modelFilter ?? ''}
            onChange={handleModelFilterChange}
            className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
          >
            <option value="">{t('conversation.allModels')}</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('conversation.dateRange')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="date-start"
                className="text-xs text-gray-700 dark:text-gray-300"
              >
                {t('conversation.from')}
              </label>
              <input
                id="date-start"
                type="date"
                value={
                  dateRangeFilter?.start
                    ? formatDateForInput(dateRangeFilter.start)
                    : ''
                }
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="date-end"
                className="text-xs text-gray-700 dark:text-gray-300"
              >
                {t('conversation.to')}
              </label>
              <input
                id="date-end"
                type="date"
                value={
                  dateRangeFilter?.end
                    ? formatDateForInput(dateRangeFilter.end)
                    : ''
                }
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={clearAllFilters}
            className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            {t('conversation.clearFilters')}
          </button>
        </div>
      </div>
    </Glass>
  );
}

/**
 * Conversation manager props
 */
export interface ConversationManagerProps {
  className?: string;
  onConversationSelect?: (conversationId: string) => void;
  showHeader?: boolean;
  showSearch?: boolean;
  showFilters?: boolean;
  compactMode?: boolean;
}

/**
 * Conversation manager component
 */
export function ConversationManager({
  className = '',
  onConversationSelect,
  showHeader = true,
  showSearch = true,
  showFilters = true,
  compactMode = false,
}: ConversationManagerProps): React.JSX.Element {
  const { t } = useI18n();
  const {
    conversations,
    filteredConversations,
    state,
    exportConversations,
    deleteMultipleConversations,
  } = useConversations();

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<
    Set<string>
  >(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const handleToggleFilterPanel = useCallback((): void => {
    setShowFilterPanel((prev) => !prev);
  }, []);

  const handleCloseFilterPanel = useCallback((): void => {
    setShowFilterPanel(false);
  }, []);

  const handleSelectAllConversations = useCallback((): void => {
    const allIds = new Set(filteredConversations.map((conv) => conv.id));
    setSelectedConversations(allIds);
  }, [filteredConversations]);

  const handleClearSelection = useCallback((): void => {
    setSelectedConversations(new Set());
    setShowBulkActions(false);
  }, []);

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selectedConversations.size === 0) {
      return;
    }

    const confirmMessage = t('conversation.bulkDeleteConfirm', {
      count: selectedConversations.size,
    });

    if (window.confirm(confirmMessage)) {
      try {
        await deleteMultipleConversations(Array.from(selectedConversations));
        handleClearSelection();
      } catch (_error) {
        // Failed to delete conversations
      }
    }
  }, [
    selectedConversations,
    deleteMultipleConversations,
    handleClearSelection,
    t,
  ]);

  const handleBulkExport = useCallback(async (): Promise<void> => {
    if (selectedConversations.size === 0) {
      return;
    }

    try {
      const exportData = await exportConversations(
        Array.from(selectedConversations)
      );

      // Create and download file
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `conversations-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      handleClearSelection();
    } catch (_error) {
      // Failed to export conversations
    }
  }, [selectedConversations, exportConversations, handleClearSelection]);

  const conversationStats = useMemo(
    () => ({
      total: conversations.length,
      filtered: filteredConversations.length,
      selected: selectedConversations.size,
    }),
    [conversations, filteredConversations, selectedConversations]
  );

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        compactMode ? 'text-sm' : '',
        className
      )}
    >
      {showHeader ? (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">
              {t('conversation.totalCount', { count: conversationStats.total })}
            </span>
            {conversationStats.filtered !== conversationStats.total && (
              <span className="text-gray-700">
                {t('conversation.filteredCount', {
                  count: conversationStats.filtered,
                })}
              </span>
            )}
            {conversationStats.selected > 0 ? (
              <span className="text-blue-700 dark:text-blue-200 font-medium">
                {t('conversation.selectedCount', {
                  count: conversationStats.selected,
                })}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {showFilters ? (
              <button
                type="button"
                onClick={handleToggleFilterPanel}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showFilterPanel
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700'
                )}
                aria-label={t('conversation.toggleFilters')}
                title={t('conversation.toggleFilters')}
              >
                <span className="text-lg">🔽</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowBulkActions((prev) => !prev)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showBulkActions
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700'
              )}
              aria-label={t('conversation.toggleBulkActions')}
              title={t('conversation.toggleBulkActions')}
            >
              <span className="text-lg">☑️</span>
            </button>
          </div>
        </div>
      ) : null}

      {showBulkActions ? (
        <Glass intensity="low" border={true} className="m-4 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleSelectAllConversations}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-sm font-medium transition-colors"
              >
                {t('conversation.selectAll')}
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-3 py-1.5 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-sm text-gray-700 transition-colors"
              >
                {t('conversation.clearSelection')}
              </button>
            </div>

            {selectedConversations.size > 0 ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleBulkExport}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-200 rounded text-sm font-medium transition-colors"
                >
                  <span>📤</span>
                  {t('conversation.exportSelected')}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-200 rounded text-sm font-medium transition-colors"
                >
                  <span>🗑️</span>
                  {t('conversation.deleteSelected')}
                </button>
              </div>
            ) : null}
          </div>
        </Glass>
      ) : null}

      {showFilters && showFilterPanel ? (
        <div className="px-4">
          <ConversationFilterPanel onClose={handleCloseFilterPanel} />
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden relative">
        {state.error && (
          <div
            className="absolute top-0 left-0 right-0 z-10 p-4 m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-200 text-sm flex items-center gap-2"
            role="alert"
          >
            <span className="text-lg">⚠️</span>
            <span>{state.error}</span>
          </div>
        )}

        <ConversationList
          onConversationSelect={onConversationSelect}
          showSearch={showSearch}
        />
      </div>
    </div>
  );
}

export default ConversationManager;
