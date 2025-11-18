/**
 * SearchPagination Component
 * 
 * Accessible pagination controls for search results.
 * Fully keyboard navigable with proper ARIA attributes.
 * 
 * Requirements:
 * - 8.9: Implements pagination with 20 results per page
 * - WCAG 2.2 AAA: Full accessibility compliance
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import './SearchPagination.css';

interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  maxPageButtons?: number;
}

export function SearchPagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  maxPageButtons = 5
}: SearchPaginationProps): React.ReactElement {
  const { t } = useTranslation();

  // Calculate page numbers to display
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const halfMax = Math.floor(maxPageButtons / 2);
    
    let startPage = Math.max(0, currentPage - halfMax);
    let endPage = Math.min(totalPages - 1, currentPage + halfMax);

    // Adjust if we're near the start or end
    if (currentPage < halfMax) {
      endPage = Math.min(totalPages - 1, maxPageButtons - 1);
    } else if (currentPage > totalPages - halfMax - 1) {
      startPage = Math.max(0, totalPages - maxPageButtons);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, page: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPageChange(page);
    }
  };

  return (
    <nav 
      className="search-pagination"
      role="navigation"
      aria-label={t('search.paginationLabel')}
    >
      {/* Previous Button */}
      <button
        className="pagination-button pagination-prev"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPreviousPage}
        aria-label={t('search.previousPage')}
        aria-disabled={!hasPreviousPage}
      >
        <span aria-hidden="true">‹</span>
        <span className="button-text">{t('search.previous')}</span>
      </button>

      {/* First Page (if not in range) */}
      {pageNumbers[0] > 0 && (
        <>
          <button
            className="pagination-button pagination-number"
            onClick={() => onPageChange(0)}
            onKeyDown={(e) => handleKeyDown(e, 0)}
            aria-label={t('search.goToPage', { page: 1 })}
          >
            1
          </button>
          {pageNumbers[0] > 1 && (
            <span className="pagination-ellipsis" aria-hidden="true">
              …
            </span>
          )}
        </>
      )}

      {/* Page Numbers */}
      {pageNumbers.map((page) => (
        <button
          key={page}
          className={`pagination-button pagination-number ${
            page === currentPage ? 'active' : ''
          }`}
          onClick={() => onPageChange(page)}
          onKeyDown={(e) => handleKeyDown(e, page)}
          aria-label={t('search.goToPage', { page: page + 1 })}
          aria-current={page === currentPage ? 'page' : undefined}
          disabled={page === currentPage}
        >
          {page + 1}
        </button>
      ))}

      {/* Last Page (if not in range) */}
      {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
        <>
          {pageNumbers[pageNumbers.length - 1] < totalPages - 2 && (
            <span className="pagination-ellipsis" aria-hidden="true">
              …
            </span>
          )}
          <button
            className="pagination-button pagination-number"
            onClick={() => onPageChange(totalPages - 1)}
            onKeyDown={(e) => handleKeyDown(e, totalPages - 1)}
            aria-label={t('search.goToPage', { page: totalPages })}
          >
            {totalPages}
          </button>
        </>
      )}

      {/* Next Button */}
      <button
        className="pagination-button pagination-next"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage}
        aria-label={t('search.nextPage')}
        aria-disabled={!hasNextPage}
      >
        <span className="button-text">{t('search.next')}</span>
        <span aria-hidden="true">›</span>
      </button>

      {/* Page Info */}
      <div className="pagination-info" aria-live="polite" aria-atomic="true">
        {t('search.pageInfo', { current: currentPage + 1, total: totalPages })}
      </div>
    </nav>
  );
}
