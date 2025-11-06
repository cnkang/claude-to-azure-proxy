# Claude-to-Azure Proxy Frontend

React frontend for the Claude-to-Azure OpenAI proxy service.

## Tech Stack

- **React 19.2** - Modern React with latest features
- **TypeScript 5.3+** - Type safety and developer experience
- **Vite** - Fast build tool and development server
- **i18next** - Internationalization (English and Chinese)
- **React Router DOM** - Client-side routing
- **Vitest + happy-dom** - Testing framework with fast DOM environment
- **ESLint + Prettier** - Code quality and formatting

## Development

### Prerequisites

- Node.js 24+
- pnpm 10.19.0+

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Code Quality

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:check

# Testing
pnpm test
pnpm test:watch
pnpm test:coverage
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── hooks/         # Custom React hooks
├── utils/         # Utility functions
├── types/         # TypeScript type definitions
├── contexts/      # React contexts
├── i18n/          # Internationalization
├── test/          # Test utilities and setup
└── assets/        # Static assets
```

## Features

- 🌐 Internationalization (English/Chinese)
- 🎨 Dark/Light theme with system preference detection
- 📱 Responsive design (mobile-first)
- ♿ WCAG 2.2 AAA accessibility compliance
- 🔒 Security-first approach
- 🚀 Performance optimized
- 🧪 Comprehensive testing

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `VITE_API_BASE_URL` - Backend API URL
- `VITE_APP_TITLE` - Application title

## API Integration

The frontend communicates with the backend through:

- REST API endpoints for configuration and CRUD operations
- Server-Sent Events (SSE) for real-time streaming responses
- File upload endpoints for code and image files

## Browser Support

- Chrome (latest 2 versions)
- Safari (latest 2 versions)
- Firefox (latest 2 versions)
- Edge (latest 2 versions)

## Contributing

1. Follow the existing code style and patterns
2. Write tests for new functionality
3. Ensure accessibility compliance
4. Update documentation as needed
