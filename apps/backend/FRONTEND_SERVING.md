# Frontend Asset Serving Implementation

This document describes the implementation of frontend asset serving for the Claude-to-Azure OpenAI
proxy service.

## Overview

The backend server now serves the React frontend application built assets while maintaining full API
functionality. This enables users to access the AI proxy service through both a web interface and
direct API calls.

## Implementation Details

### Static Assets Middleware

**File**: `src/middleware/static-assets.ts`

The static assets middleware provides:

1. **Static Asset Serving**: Serves built React application assets with proper caching headers
2. **SPA Fallback**: Serves `index.html` for client-side routing (non-API, non-asset routes)
3. **Development Proxy**: Adds CORS headers for development mode
4. **Security Headers**: Implements CSP and other security headers for frontend assets

### Key Features

#### Caching Strategy

- **Static Assets**: 1 year cache for versioned assets (JS, CSS, fonts)
- **HTML Files**: 5 minutes cache with must-revalidate
- **Images**: Medium-term caching (1 month)

#### Security Headers

- Content Security Policy (CSP) optimized for React applications
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

#### Development Support

- CORS headers for localhost origins in development mode
- Automatic OPTIONS request handling
- Hot reload compatibility

### Server Integration

**File**: `src/index.ts`

The main server class (`ProxyServer`) integrates frontend serving through:

1. **Frontend Build Detection**: Automatically detects if frontend build exists
2. **Static Asset Routes**: Serves assets from `/static/` and root paths
3. **SPA Fallback**: Handles client-side routing for React Router
4. **API Route Protection**: Ensures API routes (`/api/`, `/v1/`, `/health`) are not affected

### Path Resolution

The server resolves the frontend build path as:

```typescript
const frontendBuildPath = path.resolve(process.cwd(), '../frontend/dist');
```

This works when running from the `apps/backend` directory and looks for the built frontend at
`apps/frontend/dist`.

### Route Precedence

1. **API Routes**: `/api/*`, `/v1/*`, `/health`, `/metrics` (highest priority)
2. **Static Assets**: Files with extensions, `/assets/*`, `/static/*`
3. **SPA Fallback**: All other routes serve `index.html` for React Router

### CORS Configuration

The CORS configuration has been updated to support frontend development:

- **Development**: Allows `localhost:3000`, `localhost:5173` (Vite default)
- **Production**: Restricts to same-origin requests only
- **Credentials**: Enabled for session management

### Content Security Policy

Updated CSP headers to support React applications:

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
connect-src 'self' ws: wss: https://api.openai.com https://*.openai.azure.com;
font-src 'self' data:;
object-src 'none';
media-src 'self';
frame-src 'none';
base-uri 'self';
form-action 'self';
```

## Testing

### Unit Tests

**File**: `tests/middleware/static-assets.test.ts`

Tests cover:

- Middleware creation and configuration
- SPA fallback behavior
- Development proxy functionality
- Frontend build detection

### Integration Tests

**File**: `tests/integration/frontend-serving.test.ts`

Tests cover:

- Static asset serving with proper headers
- SPA fallback for client-side routes
- API route protection
- CORS handling in development
- Security header implementation
- Caching strategy validation

## Usage

### Development Mode

1. Build the frontend: `cd apps/frontend && pnpm build`
2. Start the backend: `cd apps/backend && pnpm dev`
3. Access the web interface at `http://localhost:8080`
4. API endpoints remain available at their original paths

### Production Mode

The server automatically serves the frontend if the build exists at `apps/frontend/dist`. If no
build is found, the server operates in API-only mode.

### Environment Variables

No additional environment variables are required. The frontend serving is automatically enabled when
a build is detected.

## File Structure

```
apps/backend/
├── src/
│   ├── middleware/
│   │   └── static-assets.ts          # Frontend serving middleware
│   └── index.ts                      # Server integration
├── tests/
│   ├── middleware/
│   │   └── static-assets.test.ts     # Unit tests
│   └── integration/
│       └── frontend-serving.test.ts  # Integration tests
└── FRONTEND_SERVING.md               # This documentation
```

## Requirements Satisfied

This implementation satisfies the following requirements from the spec:

- **6.1**: Frontend served by backend without exposing credentials
- **6.4**: CSP headers implemented for frontend security
- **Development proxy**: CORS configuration for development
- **Static asset serving**: Proper caching headers and security
- **Route conflict prevention**: API routes protected from frontend routing

## Notes

- The implementation is backward compatible - existing API functionality is unchanged
- Frontend serving is optional - server works in API-only mode if no build exists
- Security headers are optimized for React applications while maintaining security
- Development and production modes are handled automatically based on NODE_ENV
