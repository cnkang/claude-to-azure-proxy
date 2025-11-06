/**
 * Conversation Manager Component
 * 
 * Main component for conversation management that combines conversation list,
 * search, filtering, and organization features into a unified interface.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  useConversations,
  useConversationOrganization,
} from '../../hooks/useConversations.js';
import { useI18n } from '../../contexts/I18nContext.js';
import { ConversationList } from './ConversationList.js';
import './ConversationManager.css';

/**
 * Conversation filter panel props
 */
interface ConversationFilterPanelProps {
  onClose: () => void;
}

/**
 * Conversation filter panel component
 */
function ConversationFilterPanel({ onClose }: ConversationFilterPanelProps): React.JSX.Element {
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
    const models = new Set(conversations.map(conv => conv.selectedModel));
    return Array.from(models).sort();
  }, [conversations]);

  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
    setSorting(newSortBy, newSortOrder);
  }, [setSorting]);

  const handleModelFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    setModelFilter(value === '' ? undefined : value);
  }, [setModelFilter]);

  const handleDateRangeChange = useCallback((field: 'start' | 'end', value: string): void => {
    const date = value ? new Date(value) : undefined;
    
    if (field === 'start') {
      setDateRangeFilter(date ? { 
        start: date, 
        end: dateRangeFilter?.end || new Date() 
      } : undefined);
    } else {
      setDateRangeFilter(dateRangeFilter?.start ? { 
        start: dateRangeFilter.start, 
        end: date || new Date() 
      } : undefined);
    }
  }, [dateRangeFilter, setDateRangeFilter]);

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="conversation-filter-panel">
      <div className="filter-panel-header">
        <h3>{t('conversation.filters')}</h3>
        <button
          type="button"
          onClick={onClose}
          className="filter-panel-close"
          aria-label={t('common.close')}
        >
          <span className="icon-close">✕</span>
        </button>
      </div>

      <div className="filter-panel-content">
        <div className="filter-group">
          <label htmlFor="sort-select" className="filter-label">
            {t('conversation.sortBy')}
          </label>
          <select
            id="sort-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={handleSortChange}
            className="filter-select"
          >
            <option value="updatedAt-desc">{t('conversation.sortUpdatedDesc')}</option>
            <option value="updatedAt-asc">{t('conversation.sortUpdatedAsc')}</option>
            <option value="createdAt-desc">{t('conversation.sortCreatedDesc')}</option>
            <option value="createdAt-asc">{t('conversation.sortCreatedAsc')}</option>
            <option value="title-asc">{t('conversation.sortTitleAsc')}</option>
            <option value="title-desc">{t('conversation.sortTitleDesc')}</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="model-filter" className="filter-label">
            {t('conversation.filterByModel')}
          </label>
          <select
            id="model-filter"
            value={modelFilter ?? ''}
            onChange={handleModelFilterChange}
            className="filter-select"
          >
            <option value="">{t('conversation.allModels')}</option>
            {availableModels.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">
            {t('conversation.dateRange')}
          </label>
          <div className="date-range-inputs">
            <div className="date-input-group">
              <label htmlFor="date-start" className="date-label">
                {t('conversation.from')}
              </label>
              <input
                id="date-start"
                type="date"
                value={dateRangeFilter?.start ? formatDateForInput(dateRangeFilter.start) : ''}
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                className="date-input"
              />
            </div>
            <div className="date-input-group">
              <label htmlFor="date-end" className="date-label">
                {t('conversation.to')}
              </label>
              <input
                id="date-end"
                type="date"
                value={dateRangeFilter?.end ? formatDateForInput(dateRangeFilter.end) : ''}
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                className="date-input"
              />
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={clearAllFilters}
            className="clear-filters-btn"
          >
            {t('conversation.clearFilters')}
          </button>
        </div>
      </div>
    </div>
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
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  const handleToggleFilterPanel = useCallback((): void => {
    setShowFilterPanel(prev => !prev);
  }, []);

  const handleCloseFilterPanel = useCallback((): void => {
    setShowFilterPanel(false);
  }, []);

  const handleSelectAllConversations = useCallback((): void => {
    const allIds = new Set(filteredConversations.map(conv => conv.id));
    setSelectedConversations(allIds);
  }, [filteredConversations]);

  const handleClearSelection = useCallback((): void => {
    setSelectedConversations(new Set());
    setShowBulkActions(false);
  }, []);

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selectedConversations.size === 0) {return;}

    const confirmMessage = t('conversation.bulkDeleteConfirm', { 
      count: selectedConversations.size 
    });
    
    if (window.confirm(confirmMessage)) {
      try {
        await deleteMultipleConversations(Array.from(selectedConversations));
        handleClearSelection();
      } catch (_error) {
        // console.error('Failed to delete conversations:', error);
      }
    }
  }, [selectedConversations, deleteMultipleConversations, handleClearSelection, t]);

  const handleBulkExport = useCallback(async (): Promise<void> => {
    if (selectedConversations.size === 0) {return;}

    try {
      const exportData = await exportConversations(Array.from(selectedConversations));
      
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
      // console.error('Failed to export conversations:', error);
    }
  }, [selectedConversations, exportConversations, handleClearSelection]);

  const conversationStats = useMemo(() => ({
    total: conversations.length,
    filtered: filteredConversations.length,
    selected: selectedConversations.size,
  }), [conversations, filteredConversations, selectedConversations]);

  const managerClassName = useMemo(
    () =>
      ['conversation-manager', compactMode ? 'compact' : '', className]
        .filter((value): value is string => Boolean(value && value.length > 0))
        .join(' '),
    [className, compactMode]
  );

  return (
    <div className={managerClassName}>
      {showHeader ? (
        <div className="conversation-manager-header">
          <div className="conversation-stats">
            <span className="stat-item">
              {t('conversation.totalCount', { count: conversationStats.total })}
            </span>
            {conversationStats.filtered !== conversationStats.total && (
              <span className="stat-item">
                {t('conversation.filteredCount', { count: conversationStats.filtered })}
              </span>
            )}
            {conversationStats.selected > 0 ? (
              <span className="stat-item selected">
                {t('conversation.selectedCount', { count: conversationStats.selected })}
              </span>
            ) : null}
          </div>

          <div className="conversation-actions">
            {showFilters ? (
              <button
                type="button"
                onClick={handleToggleFilterPanel}
                className={`filter-toggle-btn ${showFilterPanel ? 'active' : ''}`}
                aria-label={t('conversation.toggleFilters')}
                title={t('conversation.toggleFilters')}
              >
                <span className="icon-filter">🔽</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowBulkActions((prev) => !prev)}
              className={`bulk-actions-toggle ${showBulkActions ? 'active' : ''}`}
              aria-label={t('conversation.toggleBulkActions')}
              title={t('conversation.toggleBulkActions')}
            >
              <span className="icon-select">☑️</span>
            </button>
          </div>
        </div>
      ) : null}

      {showBulkActions ? (
        <div className="bulk-actions-panel">
          <div className="bulk-actions-header">
            <div className="bulk-selection-controls">
              <button
                type="button"
                onClick={handleSelectAllConversations}
                className="select-all-btn"
              >
                {t('conversation.selectAll')}
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="clear-selection-btn"
              >
                {t('conversation.clearSelection')}
              </button>
            </div>

            {selectedConversations.size > 0 ? (
              <div className="bulk-actions">
                <button
                  type="button"
                  onClick={handleBulkExport}
                  className="bulk-action-btn export"
                >
                  <span className="icon-export">📤</span>
                  {t('conversation.exportSelected')}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="bulk-action-btn delete"
                >
                  <span className="icon-delete">🗑️</span>
                  {t('conversation.deleteSelected')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showFilters && showFilterPanel ? (
        <ConversationFilterPanel onClose={handleCloseFilterPanel} />
      ) : null}

      <div className="conversation-manager-content">
        {state.error && (
          <div className="conversation-manager-error" role="alert">
            <span className="error-icon">⚠️</span>
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
