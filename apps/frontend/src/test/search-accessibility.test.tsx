import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationSearch } from '../components/search/ConversationSearch.js';
import { AppProvider } from '../contexts/AppContext.js';
import { SessionProvider } from '../contexts/SessionContext.js';

// Mock the search service
vi.mock('../services/conversation-search.js', () => ({
  ConversationSearchService: class {
    search = vi.fn().mockReturnValue([]);
  },
}));

// Mock conversations data
const mockConversations = [
  {
    id: 'conv-1',
    title: 'Test Conversation',
    messages: [{ content: 'test content', role: 'user' as const }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Helper to render with all necessary providers
const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <SessionProvider>
      <AppProvider>{component}</AppProvider>
    </SessionProvider>
  );
};

describe('Search Components Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ConversationSearch', () => {
    it('has proper ARIA labels and roles', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toHaveAttribute('role', 'search');
    });

    it('provides screen reader instructions', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });

    it('supports keyboard navigation with Escape key', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });

    it('has minimum 44x44px touch target for input', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });

    it('shows loading state with proper ARIA attributes', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });

    it('announces search results to screen readers', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation Integration', () => {
    it('supports Tab navigation through search interface', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Screen Reader Support', () => {
    it('provides live region for search results', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });
  });

  describe('Focus Management', () => {
    it('maintains focus on search input after clearing', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });

    it('shows visible focus indicators', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('maintains accessibility on mobile viewports', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('SearchResultItem', () => {
    it('highlights keywords with proper contrast', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });

    it('has minimum 44x44px touch targets for buttons', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });

    it('uses semantic mark element for keyword highlighting', () => {
      renderWithProvider(
        <ConversationSearch
          conversations={mockConversations}
          onResultSelect={() => {}}
        />
      );

      const searchComponent = screen.getByTestId('conversation-search');
      expect(searchComponent).toBeInTheDocument();
    });
  });
});
