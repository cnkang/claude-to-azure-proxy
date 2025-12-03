# AI Agent Reference Guide for Claude-to-Azure OpenAI Proxy

## Table of Contents

1. [Project Overview](#project-overview)
2. [Monorepo Architecture](#monorepo-architecture)
3. [Code Reuse and Architecture Principles](#code-reuse-and-architecture-principles)
4. [Technology Stack & Architecture](#technology-stack--architecture)
5. [Agent Workflow Checklist](#agent-workflow-checklist)
6. [Development Guidelines](#development-guidelines)
7. [Quality Gate Summary](#quality-gate-summary)
8. [Testing Requirements](#testing-requirements)
9. [Monitoring & Observability](#monitoring--observability)
10. [Deployment](#deployment)
11. [Business Logic](#business-logic)
12. [Common Patterns](#common-patterns)
13. [Best Practices for AI Agents](#best-practices-for-ai-agents)

## Project Overview

This is a **production-ready TypeScript monorepo** containing an API proxy server and a modern React web frontend. The proxy seamlessly translates Claude API requests to Azure OpenAI and AWS Bedrock formats with intelligent model routing, while the frontend provides a browser-based interface for direct AI interaction.

### Core Purpose

- **Multi-Service Integration**: Intelligent routing between Azure OpenAI (GPT-5-Codex) and AWS Bedrock (Qwen models)
- **API Translation**: Bidirectional request/response transformation supporting both Claude and OpenAI formats
- **Web Interface**: Modern React 19.2 frontend with conversation management, i18n, and accessibility
- **Security Gateway**: Enterprise-grade authentication, rate limiting, and input validation
- **Production Ready**: Comprehensive monitoring, health checks, and resilience features
- **Cloud Optimized**: Designed for AWS App Runner, ECS, and Kubernetes deployment

## Monorepo Architecture

This project uses **pnpm workspaces** for efficient monorepo management with shared packages and independent applications.

### Project Structure

```
claude-to-azure-proxy/
├── apps/
│   ├── backend/              # Express.js API proxy server
│   │   ├── src/
│   │   │   ├── clients/      # Azure OpenAI & AWS Bedrock clients
│   │   │   ├── config/       # Environment validation with Joi
│   │   │   ├── errors/       # Custom error classes
│   │   │   ├── middleware/   # Security, logging, auth, format detection
│   │   │   ├── monitoring/   # Health checks, metrics, performance
│   │   │   ├── resilience/   # Circuit breakers, retry logic
│   │   │   ├── routes/       # API endpoints (completions, chat, models)
│   │   │   ├── runtime/      # Node.js 24 optimizations
│   │   │   ├── services/     # Business logic (model routing, streaming)
│   │   │   ├── types/        # TypeScript type definitions
│   │   │   ├── utils/        # Transformers, validators, helpers
│   │   │   ├── validation/   # Request validation schemas
│   │   │   └── index.ts      # Main application entry point
│   │   └── tests/            # Comprehensive test coverage
│   │
│   └── frontend/             # React 19.2 web application
│       ├── src/
│       │   ├── components/   # React components (chat, conversation, search)
│       │   ├── contexts/     # React contexts (App, Theme, I18n, Session)
│       │   ├── hooks/        # Custom React hooks
│       │   ├── i18n/         # Internationalization (en, zh-CN, zh-TW)
│       │   ├── pages/        # Page components (Chat, Settings)
│       │   ├── router/       # React Router configuration
│       │   ├── services/     # API clients, storage, sync
│       │   ├── styles/       # CSS (themes, accessibility, animations)
│       │   ├── types/        # TypeScript type definitions
│       │   ├── utils/        # Utility functions
│       │   └── test/         # Frontend tests (unit, integration, e2e)
│       └── public/           # Static assets
│
├── packages/
│   ├── shared-types/         # Shared TypeScript interfaces
│   ├── shared-utils/         # Shared utility functions
│   └── shared-config/        # Shared ESLint, TypeScript, Vitest configs
│
├── docs/                     # Documentation
├── infra/                    # Docker, Kubernetes, monitoring
├── scripts/                  # Build and deployment scripts
└── tests/                    # E2E tests (Playwright)
```

### Applications

#### Backend (`apps/backend`)
- **Express.js 5.2** API server with TypeScript
- **Multi-service support**: Azure OpenAI v1 Responses API + AWS Bedrock
- **Intelligent model routing**: Automatic service selection based on model parameter
- **Node.js 24 optimizations**: Enhanced V8 13.6, explicit resource management
- **325+ tests**: Unit, integration, security, performance

#### Frontend (`apps/frontend`)
- **React 19.2** with TypeScript and Vite
- **Modern UI**: Glass morphism design with accessibility (WCAG 2.2 AAA)
- **Internationalization**: English, Simplified Chinese, Traditional Chinese
- **Conversation management**: IndexedDB persistence with cross-tab sync
- **Real-time streaming**: Server-Sent Events for AI responses
- **Comprehensive testing**: Vitest, React Testing Library, Playwright E2E

### Shared Packages

- **shared-types**: Common TypeScript interfaces for logging, API contracts
- **shared-utils**: Utility functions for correlation IDs, validation, error handling
- **shared-config**: Centralized ESLint, TypeScript, and Vitest configurations

## Code Reuse and Architecture Principles

### 🔄 Reuse Existing Code and Architecture

**CRITICAL**: Always prioritize reusing existing code and architectural patterns over creating new
implementations.

**ZERO TOLERANCE FOR DUPLICATE CODE**: Before writing any new functionality, you MUST thoroughly
search for existing implementations that can be reused or extended. Creating duplicate functionality
is strictly prohibited.

#### Mandatory Pre-Implementation Checklist:

1. **Search existing codebase** using file search and grep for similar functionality
2. **Check backend utilities** (`apps/backend/src/utils/`) for reusable transformers and validators
3. **Check frontend utilities** (`apps/frontend/src/utils/`, `apps/frontend/src/hooks/`) for React patterns
4. **Review shared packages** (`packages/shared-types/`, `packages/shared-utils/`) for cross-app code
5. **Review error handling** (`apps/backend/src/errors/`, `apps/frontend/src/errors/`) for error classes
6. **Examine middleware** (`apps/backend/src/middleware/`) for cross-cutting concerns
7. **Look at type definitions** (`apps/backend/src/types/`, `apps/frontend/src/types/`, `packages/shared-types/`)
8. **Review configuration** (`apps/backend/src/config/`) for validation schemas
9. **Check API clients** (`apps/backend/src/clients/`, `apps/frontend/src/services/`) for client patterns
10. **Review services** (`apps/backend/src/services/`, `apps/frontend/src/services/`) for business logic

#### Strict Reuse Guidelines:

**Backend:**
- **Error Handling**: ALWAYS use existing error classes from `apps/backend/src/errors/index.ts`
- **Request Validation**: MUST extend existing validation patterns from `apps/backend/src/validation/`
- **Response Transformation**: MUST build upon existing transformers in `apps/backend/src/utils/`
- **Configuration**: MUST extend existing config patterns in `apps/backend/src/config/index.ts`
- **API Clients**: MUST follow existing client patterns from `apps/backend/src/clients/`
- **Middleware**: MUST reuse existing middleware patterns for authentication, logging, security
- **Services**: MUST extend existing services in `apps/backend/src/services/`

**Frontend:**
- **Error Handling**: ALWAYS use existing error classes from `apps/frontend/src/errors/`
- **React Hooks**: MUST reuse existing hooks from `apps/frontend/src/hooks/`
- **Contexts**: MUST extend existing contexts from `apps/frontend/src/contexts/`
- **Services**: MUST build upon existing services in `apps/frontend/src/services/`
- **Components**: MUST follow existing component patterns in `apps/frontend/src/components/`
- **Utilities**: MUST reuse existing utilities from `apps/frontend/src/utils/`

**Shared:**
- **Type Definitions**: MUST extend existing types from `packages/shared-types/` for cross-app interfaces
- **Utilities**: MUST use shared utilities from `packages/shared-utils/` for common functionality

#### Examples of Good Reuse:

```typescript
// ✅ GOOD: Reuse existing error classes
import { ValidationError, AzureOpenAIError, ErrorFactory } from '../errors/index.js';
throw new ValidationError('Invalid input', correlationId, 'field', value);

// ✅ GOOD: Reuse existing error factory
return ErrorFactory.fromAzureOpenAIError(error, correlationId, operation);

// ✅ GOOD: Extend existing configuration patterns
export function createAzureOpenAIConfig(config: Config): AzureOpenAIConfig {
  // Build upon existing config structure with proper validation
  return {
    baseURL: ensureV1Endpoint(config.AZURE_OPENAI_ENDPOINT),
    apiKey: config.AZURE_OPENAI_API_KEY,
    // API version removed - using latest stable Azure OpenAI API (v1)
    deployment: config.AZURE_OPENAI_MODEL,
    timeout: config.AZURE_OPENAI_TIMEOUT,
    maxRetries: config.AZURE_OPENAI_MAX_RETRIES,
  };
}

// ✅ GOOD: Reuse existing client patterns
export class NewAPIClient {
  private readonly client: SomeClient;
  private readonly config: SomeConfig;

  constructor(config: SomeConfig) {
    this.validateConfig(config); // Reuse validation pattern
    this.config = Object.freeze({ ...config }); // Reuse immutability pattern
    // Follow existing client initialization patterns
  }

  private validateConfig(config: SomeConfig): void {
    // Reuse existing validation patterns from AzureResponsesClient
  }

  private handleApiError(error: unknown, operation: string): Error {
    // Reuse existing error handling patterns
    return ErrorFactory.fromSomeAPIError(error, uuidv4(), operation);
  }
}

// ❌ BAD: Creating duplicate error handling
class MyCustomError extends Error {
  /* duplicate functionality */
}

// ❌ BAD: Reimplementing existing validation
function validateMyConfig(config: any) {
  /* duplicate validation logic */
}

// ❌ BAD: Creating new error factory when one exists
function createMyError(error: any) {
  /* duplicate error creation */
}
```

#### Benefits of Strict Code Reuse:

1. **Consistency** - Uniform error handling, validation, and patterns across the entire codebase
2. **Maintainability** - Single source of truth for common functionality reduces maintenance burden
3. **Testing** - Existing code is already tested and proven, reducing testing overhead
4. **Security** - Reuse security-hardened implementations rather than creating new attack surfaces
5. **Performance** - Avoid duplicate implementations that increase bundle size and memory usage
6. **Quality** - Existing code follows established patterns and quality standards

## Technology Stack & Architecture

### Core Technologies

**Backend:**
- **Runtime**: Node.js 24+ with ES Modules (ESM) and V8 13.6 optimizations
- **Language**: TypeScript 5.9+ with strict mode (no `any` types)
- **Framework**: Express.js 5.2 with typed Request/Response interfaces
- **Package Manager**: pnpm 10.20.0+ (workspace support)
- **Testing**: Vitest 4.0+ with >90% coverage requirement

**Frontend:**
- **Framework**: React 19.2 with TypeScript
- **Build Tool**: Vite 6.0+ with SWC
- **UI Library**: Custom components with glass morphism design
- **State Management**: React Context API + hooks
- **Routing**: React Router 7.1+
- **Storage**: IndexedDB with localStorage fallback
- **Testing**: Vitest + React Testing Library + Playwright

**Shared:**
- **Monorepo**: pnpm workspaces with shared packages
- **Linting**: Biome 1.9+ (replaces ESLint + Prettier)
- **Type Checking**: TypeScript strict mode across all packages

### Key Dependencies

**Backend:**
- **axios**: Azure OpenAI & AWS Bedrock API calls with timeout and retry logic
- **openai**: Official OpenAI SDK for Azure integration
- **helmet**: Security headers (never disable)
- **express-rate-limit**: Required on all public endpoints
- **express-validator**: Schema-based input validation
- **joi**: Environment variable validation (fail-fast)
- **uuid**: Correlation IDs for request tracing
- **multer**: File upload handling

**Frontend:**
- **react**: UI framework with concurrent features
- **react-router-dom**: Client-side routing
- **i18next**: Internationalization framework
- **prismjs**: Syntax highlighting for code blocks
- **react-window**: Virtual scrolling for performance
- **axios**: API client for backend communication

### Architecture Layers (Strict Dependencies)

**Backend Layers:**
1. **Routes** → Services, Middleware, Utils, Types (no direct external API calls)
2. **Services** → Clients, Utils, Types (business logic layer)
3. **Clients** → Utils, Types (external API integration)
4. **Middleware** → Utils, Types, Config (cross-cutting concerns only)
5. **Utils** → Types only (pure functions, no side effects)
6. **Config** → Types only (validation and environment setup)

**Frontend Layers:**
1. **Pages** → Components, Hooks, Services, Contexts
2. **Components** → Hooks, Utils, Contexts
3. **Hooks** → Services, Utils, Contexts
4. **Services** → Utils, Types (API clients, storage)
5. **Contexts** → Hooks, Utils (global state)
6. **Utils** → Types only (pure functions)

**Shared Packages:**
- **shared-types**: No dependencies (pure type definitions)
- **shared-utils**: Types only (utility functions)
- **shared-config**: Configuration files (ESLint, TypeScript, Vitest)

## Agent Workflow Checklist

1. **Intake & Scope**
   - Confirm environment context (branch, sandbox, permissions).
   - Capture user goals plus implicit constraints (e.g., reuse policy, heap caps).
2. **Discovery**
   - Locate existing code by searching `src/`, `apps/`, and relevant packages before authoring new logic.
   - Identify impacted layers (routes, middleware, utils) and map dependencies.
3. **Plan**
   - Break work into auditable steps; prefer smaller PR-sized commits with meaningful messages.
   - Document assumptions (e.g., network-disabled) inside commit descriptions or comments when critical.
4. **Implement**
   - Follow layering rules, TypeScript strictness, and reuse guidelines.
   - Update documentation or schemas when behavior or contracts evolve.
5. **Validate**
   - Run the narrowest pnpm/vitest suites that give confidence (unit → integration → e2e).
   - Capture output summaries in the final response; rerun failed checks after fixes.
6. **Deliver**
   - Stage logically grouped files; use conventional commits (`feat|fix|chore|docs|test|refactor`).
   - Provide a concise summary plus explicit next steps/tests for the reviewer.

## Development Guidelines

### TypeScript Requirements

- **Strict Mode**: All TypeScript strict checks enabled
- **Import Extensions**: Always use `.js` extensions in imports (ESM requirement)
- **Return Types**: Explicit return types on all functions
- **Type Safety**: Use `unknown` instead of `any` with type guards
- **Immutability**: Prefer `readonly` types for immutable data

### Import Pattern (Always Follow)

```typescript
// External dependencies first
import express from 'express';
import type { Request, Response } from 'express';

// Internal types
import type { ApiRequest, ApiResponse } from '../types/index.js';

// Internal utilities
import { validateRequest } from '../utils/index.js';
```

### Error Handling Pattern (Mandatory)

**Backend:**
```typescript
try {
  const result = await externalApiCall();
  return transformResponse(result);
} catch (error) {
  logger.error('Operation failed', { correlationId, error });
  throw new ApiError('Operation failed', 500);
}
```

**Frontend:**
```typescript
try {
  const result = await apiCall();
  return result;
} catch (error) {
  logger.error('Operation failed', { error });
  // Show user-friendly error message
  throw new Error(t('errors.operationFailed'));
}
```

### Core Commands Reference

| Purpose                    | Command                                  | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Install deps               | `pnpm install`                           | Run at repo root                                 |
| Type check all packages    | `pnpm -r type-check`                     | Uses each package’s TS config                    |
| Backend unit tests         | `pnpm --filter @repo/backend test`       | Honors NODE_OPTIONS defaults                     |
| Frontend vitest (no cov)   | `cd apps/frontend && pnpm test:direct`   | Uses 4 GB heap cap                                |
| Frontend coverage          | `cd apps/frontend && pnpm test:coverage` | NODE_OPTIONS limited to 8 GB (see CI policy)     |
| Lint all packages          | `pnpm -r lint`                           | Biome-based linting; add `:fix` for auto fixes    |
| Format                     | `pnpm run format`                        | Biome formatter via `biome.json`                  |
| Build backend              | `pnpm --filter @repo/backend build`      | Uses optimized Node flags                        |
| Build frontend             | `pnpm --filter @repo/frontend build`     | Vite production build                            |

> Tip: Always run commands from repo root unless the package-specific README states otherwise.

## Quality Gate Summary

| Category        | Minimum Expectation                                             |
| --------------- | ---------------------------------------------------------------- |
| **Type Safety** | TypeScript strict mode + zero implicit `any`s                    |
| **Testing**     | Vitest suites ≥90% coverage overall; critical flows 100%         |
| **Linting**     | Biome diagnostics clean; run `pnpm lint:fix` before commit       |
| **Formatting**  | Biome formatter via `pnpm run format`                            |
| **Docs**        | Update READMEs/specs when APIs, env vars, or workflows change    |
| **Performance** | Respect heap caps (≤8 GB for test coverage) and streaming SLAs   |
| **Security**    | Authentication on every route (except `/health`), sanitized logs |

### Naming Conventions

- **Files**: kebab-case (`error-handler.ts`, `conversation-list.tsx`)
- **Classes**: PascalCase (`ProxyServer`, `ConversationStorage`)
- **Functions/Variables**: camelCase (`validateRequest`, `handleSubmit`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`, `DEFAULT_TIMEOUT`)
- **Types/Interfaces**: PascalCase (`ApiRequest`, `ConversationData`)
- **React Components**: PascalCase (`ChatPage`, `MessageItem`)
- **React Hooks**: camelCase with `use` prefix (`useConversations`, `useTheme`)

### Core Commands Reference

**Monorepo Commands (run from root):**

| Purpose                    | Command                                  | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Install deps               | `pnpm install`                           | Installs all workspace dependencies              |
| Build all                  | `pnpm build`                             | Builds all apps and packages                     |
| Build backend              | `pnpm build:backend`                     | Build backend only                               |
| Build frontend             | `pnpm build:frontend`                    | Build frontend only                              |
| Build shared packages      | `pnpm build:shared`                      | Build shared packages only                       |
| Test all                   | `pnpm test`                              | Run all tests across workspace                   |
| Test backend               | `pnpm test:backend`                      | Backend tests only                               |
| Test frontend              | `pnpm test:frontend`                     | Frontend tests only                              |
| Test E2E                   | `pnpm test:e2e`                          | Playwright E2E tests                             |
| Lint all                   | `pnpm lint`                              | Biome linting across workspace                   |
| Lint fix                   | `pnpm lint:fix`                          | Auto-fix Biome issues                            |
| Format                     | `pnpm format`                            | Format all files with Biome                      |
| Type check all             | `pnpm type-check`                        | TypeScript check across workspace                |

**Development Commands:**

| Purpose                    | Command                                  | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Dev backend                | `pnpm dev`                               | Start backend with hot reload                    |
| Dev frontend               | `pnpm dev:frontend`                      | Start frontend dev server                        |
| Dev all                    | `pnpm dev:all`                           | Start both backend and frontend                  |
| Start production           | `pnpm start`                             | Start backend in production mode                 |

**Docker Commands:**

| Purpose                    | Command                                  | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Build backend image        | `pnpm docker:build:backend`              | Build backend Docker image                       |
| Build frontend image       | `pnpm docker:build:frontend`             | Build frontend Docker image                      |
| Build all images           | `pnpm docker:build:all`                  | Build both images                                |
| Run with compose           | `pnpm docker:compose:up`                 | Start all services with Docker Compose           |

**Quality Commands:**

| Purpose                    | Command                                  | Notes                                             |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Quality checks             | `pnpm quality:all`                       | Run all quality checks                           |
| Security audit             | `pnpm quality:security`                  | Comprehensive security audit                     |
| Coverage report            | `pnpm test:coverage`                     | Generate coverage for all packages               |

> **Tip**: Always run commands from repo root unless the package-specific README states otherwise.
> Use `pnpm --filter <package>` to run commands in specific packages.

## API Specification

### Authentication

All endpoints (except `/health`) require authentication:

- `Authorization: Bearer <token>` header
- `x-api-key: <key>` header

### Core Endpoints

- `GET /health` - Health check (no auth required)
- `GET /` - Service information
- `GET /v1/models` - Claude API compatible models endpoint
- `POST /v1/completions` - Claude API compatible completions endpoint

### Request/Response Format

All responses include correlation IDs for tracing:

```json
{
  "correlationId": "uuid-v4-correlation-id"
  // ... response data
}
```

Error responses follow consistent format:

```json
{
  "error": {
    "type": "error_type",
    "message": "Human readable error message",
    "correlationId": "uuid-v4-correlation-id",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Environment Configuration

### Required Variables

```bash
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=your-model-deployment-name
PORT=8080
NODE_ENV=production
```

### Optional Variables (Azure OpenAI v1 API)

```bash
# API version is automatically handled - no configuration needed
AZURE_OPENAI_TIMEOUT=120000         # Optional: request timeout in milliseconds
AZURE_OPENAI_MAX_RETRIES=3          # Optional: maximum retry attempts
DEFAULT_REASONING_EFFORT=medium     # Optional: default reasoning effort level
```

**Important**: Azure OpenAI v1 API automatically uses the latest stable version. No API version
configuration is required.

### Validation Rules

- `PROXY_API_KEY`: 32-256 characters
- `AZURE_OPENAI_ENDPOINT`: Valid HTTPS URL
- `AZURE_OPENAI_API_KEY`: 32-256 characters
- `AZURE_OPENAI_MODEL`: Alphanumeric with hyphens/underscores
- `PORT`: Integer 1024-65535
- `NODE_ENV`: development|production|test

## Security Implementation

### Security Features

- **Multi-method Authentication**: Bearer token and API key support
- **Rate Limiting**: Global and per-IP limits
- **Input Validation**: Comprehensive request sanitization
- **Security Headers**: Helmet.js with OWASP best practices
- **CORS Protection**: Configurable cross-origin resource sharing
- **Log Sanitization**: Automatic PII removal from logs

### Security Patterns (Mandatory)

- All routes require authentication middleware
- Input validation on all request parameters
- Rate limiting on all public endpoints
- Sanitize all error responses (no stack traces in production)
- Use correlation IDs for tracing without exposing sensitive data

## Development Commands

**Backend Development:**
```bash
# Development
pnpm dev                              # Hot reload development server
pnpm dev:debug                        # Start with debugger on port 9229

# Building
pnpm --filter @repo/backend build     # Build backend
pnpm --filter @repo/backend build:clean  # Clean build

# Testing
pnpm --filter @repo/backend test      # Run backend tests
pnpm --filter @repo/backend test:coverage  # With coverage
pnpm --filter @repo/backend test:performance  # Performance tests
pnpm --filter @repo/backend test:memory      # Memory tests

# Production
pnpm start                            # Standard production mode
pnpm start:prod                       # Optimized production mode
pnpm start:optimized                  # Maximum optimization
```

**Frontend Development:**
```bash
# Development
pnpm dev:frontend                     # Start frontend dev server

# Building
pnpm --filter @repo/frontend build    # Build frontend for production

# Testing
pnpm --filter @repo/frontend test     # Run frontend tests
pnpm --filter @repo/frontend test:coverage  # With coverage
pnpm test:e2e                         # Playwright E2E tests
pnpm test:e2e:ui                      # E2E tests with UI
```

**Monorepo Commands:**
```bash
# Build all
pnpm build                            # Build all apps and packages
pnpm build:clean                      # Clean build all

# Test all
pnpm test                             # Run all tests
pnpm test:coverage                    # Coverage for all packages

# Code quality (run before commits)
pnpm lint:fix                         # Auto-fix Biome issues
pnpm format                           # Format with Biome
pnpm type-check                       # TypeScript check all
pnpm quality:all                      # Run all quality checks

# Security and documentation
pnpm quality:security                 # Comprehensive security audit
pnpm docs:generate                    # Generate TypeScript API documentation
```

## Testing Requirements

### Test Structure

**Backend Tests:**
- Mirror `apps/backend/src/` structure in `apps/backend/tests/`
- Use test factories from `apps/backend/tests/test-factories.ts`
- Include unit, integration, security, and performance tests
- Mock external dependencies consistently

**Frontend Tests:**
- Tests located in `apps/frontend/src/test/`
- Use test utilities from `apps/frontend/src/test/test-utils.ts`
- Include unit, integration, accessibility, and E2E tests
- Mock API calls and storage consistently

**E2E Tests:**
- Located in `tests/` (root level)
- Use Playwright for cross-browser testing
- Test full user workflows across frontend and backend

### Coverage Targets

- **Overall**: Minimum 90% code coverage across all packages
- **Critical Security**: 100% coverage for authentication, validation, and security functions
- **Error Paths**: Test all error paths and edge cases
- **Performance**: Include performance and load testing for API endpoints
- **Accessibility**: WCAG 2.2 AAA compliance testing for frontend

### Test Categories

**Backend:**
- **Unit**: Individual function/class testing
- **Integration**: Full request/response flow with external APIs
- **Security**: Authentication, rate limiting, input validation
- **Performance**: Load testing, memory profiling, streaming performance
- **Error Handling**: All error paths and resilience patterns

**Frontend:**
- **Unit**: Component and hook testing
- **Integration**: Multi-component workflows and API integration
- **Accessibility**: WCAG compliance, keyboard navigation, screen reader support
- **E2E**: Full user workflows with Playwright
- **Performance**: Rendering performance, memory management, virtual scrolling
- **i18n**: Internationalization and localization testing

## Monitoring & Observability

### Health Monitoring

- Comprehensive health checks with Azure OpenAI connectivity testing
- Memory usage monitoring with thresholds
- Performance metrics collection
- Structured JSON logging with correlation IDs

### Metrics Collection

- **Performance**: Request duration, success rates, error rates
- **Resources**: Memory usage, CPU usage, event loop lag
- **Business**: API usage patterns, model utilization
- **Security**: Authentication attempts, rate limit hits

### Logging Format

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "correlationId": "uuid-v4",
  "message": "Request completed",
  "service": "claude-to-azure-proxy",
  "version": "2.0.0",
  "environment": "production",
  "metadata": {
    "request": { "method": "POST", "url": "/v1/completions" },
    "response": { "statusCode": 200, "responseTime": 1250 }
  }
}
```

## Deployment

### AWS App Runner (Recommended)

- Optimized for AWS App Runner deployment
- Uses PORT environment variable for dynamic port assignment
- Health check endpoint at `/health`
- Graceful shutdown handling

### Docker Support

- Multi-stage builds: deps → builder → runner
- `node:24-alpine` base image
- Non-root user with minimal privileges
- Security scanning with hadolint

### Configuration

- Validate all environment variables at startup
- Support both development and production patterns
- Use secure defaults and fail-fast on misconfiguration

## Code Quality Standards

### Quality Assurance Tools

- **TypeScript**: Strict mode with comprehensive type checking
- **Biome**: Formatter and linter with organized imports
- **Vitest**: Comprehensive testing framework
- **Type Coverage**: 95% type coverage requirement
- **Complexity Analysis**: Cyclomatic complexity ≤ 10

### Security Scanning

- Automated dependency vulnerability scanning
- Static Application Security Testing (SAST)
- Container security scanning
- Secret detection in code and configuration

### Documentation

- TSDoc comments for all public APIs
- OpenAPI 3.0.3 specification
- Comprehensive deployment and operations guides
- TypeDoc-generated API documentation

## Business Logic

### Model Routing and Multi-Service Support

**Intelligent Model Routing:**
- **Azure OpenAI Models**: `gpt-5-codex`, `gpt-4`, `claude-3-5-sonnet-20241022`
- **AWS Bedrock Models**: `qwen-3-coder`, `qwen.qwen3-coder-480b-a35b-v1:0`
- **Automatic Routing**: Based on model parameter in request
- **Fallback Strategy**: Default to Azure OpenAI for unrecognized models

**Model Capabilities:**
- Maintain model capability parity (context length, features)
- Handle unsupported model requests gracefully with clear error messages
- Support both Claude and OpenAI request/response formats

### Request/Response Transformation

**Multi-Format Support:**
- **Claude Format**: `/v1/messages` endpoint with Claude-style requests
- **OpenAI Format**: `/v1/chat/completions` endpoint with OpenAI-style requests
- **Automatic Detection**: Middleware detects format and transforms accordingly

**Transformation Rules:**
- Preserve all API semantics in transformations
- Handle streaming responses identically to original API behavior
- Maintain request correlation and timing characteristics
- Transform error responses to match expected format

**Streaming Support:**
- Server-Sent Events (SSE) for real-time responses
- Proper chunk formatting for both Claude and OpenAI formats
- Error handling during streaming
- Connection management and cleanup

### Conversation Management

**Backend:**
- Multi-turn conversation tracking with context preservation
- Conversation context service for state management
- Intelligent reasoning effort adjustment based on conversation history

**Frontend:**
- IndexedDB persistence for conversation history
- Cross-tab synchronization for multi-window support
- Search functionality with fuzzy matching
- Export/import capabilities for data portability

### Performance Requirements

**Backend:**
- Target sub-100ms proxy overhead for non-streaming requests
- Support concurrent requests with proper resource management
- Implement efficient memory usage for streaming responses
- Node.js 24 optimizations for enhanced performance

**Frontend:**
- Virtual scrolling for large conversation lists
- Lazy loading of conversation content
- Code splitting for optimal bundle size
- Service worker for offline support (future enhancement)

## Common Patterns

### Backend Patterns

#### Adding New Routes

```typescript
// apps/backend/src/routes/new-feature.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from '../middleware/logging.js';

export const newFeatureHandler = [
  // Input validation
  body('param').isString().isLength({ min: 1, max: 100 }),

  // Handler
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;

    // Validation check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          type: 'validation_error',
          message: 'Invalid request parameters',
          correlationId,
        },
      });
    }

    try {
      // Business logic here (preferably in a service)
      const result = await processRequest(req.body);
      res.json({ result, correlationId });
    } catch (error) {
      logger.error('Request failed', { correlationId, error });
      res.status(500).json({
        error: {
          type: 'internal_error',
          message: 'Request processing failed',
          correlationId,
        },
      });
    }
  },
];
```

#### Adding New Services

```typescript
// apps/backend/src/services/new-service.ts
import type { SomeConfig } from '../types/index.js';
import { logger } from '../middleware/logging.js';

export class NewService {
  private readonly config: Readonly<SomeConfig>;

  constructor(config: SomeConfig) {
    this.config = Object.freeze({ ...config });
  }

  async processData(input: string, correlationId: string): Promise<string> {
    try {
      logger.info('Processing data', { correlationId, input });
      // Business logic here
      return result;
    } catch (error) {
      logger.error('Processing failed', { correlationId, error });
      throw error;
    }
  }
}
```

#### Adding New Middleware

```typescript
// apps/backend/src/middleware/new-middleware.ts
import type { Request, Response, NextFunction } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from './logging.js';

export const newMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    // Middleware logic here
    logger.info('Middleware executed', { correlationId });
    next();
  } catch (error) {
    logger.error('Middleware error', { correlationId, error });
    next(error);
  }
};
```

### Frontend Patterns

#### Adding New React Components

```typescript
// apps/frontend/src/components/new-feature/NewComponent.tsx
import { useState, useCallback } from 'react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

interface NewComponentProps {
  onAction: (data: string) => void;
  className?: string;
}

export const NewComponent: FC<NewComponentProps> = ({ onAction, className }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<string>('');

  const handleAction = useCallback(() => {
    try {
      logger.info('Action triggered', { state });
      onAction(state);
    } catch (error) {
      logger.error('Action failed', { error });
    }
  }, [state, onAction]);

  return (
    <div className={className} role="region" aria-label={t('newComponent.label')}>
      {/* Component content */}
      <button onClick={handleAction} aria-label={t('newComponent.action')}>
        {t('newComponent.actionButton')}
      </button>
    </div>
  );
};
```

#### Adding New Custom Hooks

```typescript
// apps/frontend/src/hooks/useNewFeature.ts
import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

interface UseNewFeatureOptions {
  enabled?: boolean;
}

export const useNewFeature = (options: UseNewFeatureOptions = {}) => {
  const { enabled = true } = options;
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch logic here
      const result = await someApiCall();
      setData(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      logger.error('Fetch failed', { error });
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
```

#### Adding New Services

```typescript
// apps/frontend/src/services/new-service.ts
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export class NewService {
  private readonly client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async fetchData(id: string): Promise<SomeData> {
    try {
      logger.info('Fetching data', { id });
      const response = await this.client.get(`/data/${id}`);
      return response.data;
    } catch (error) {
      logger.error('Fetch failed', { id, error });
      throw error;
    }
  }
}
```

### Shared Package Patterns

#### Adding Shared Types

```typescript
// packages/shared-types/src/index.ts
export interface SharedType {
  id: string;
  name: string;
  createdAt: Date;
}

export type SharedStatus = 'pending' | 'active' | 'completed';
```

#### Adding Shared Utilities

```typescript
// packages/shared-utils/src/index.ts
/**
 * Shared utility function
 * @param input - Input parameter
 * @returns Processed output
 */
export const sharedUtility = (input: string): string => {
  // Pure function logic
  return input.trim().toLowerCase();
};
```

## Key Files Reference

### Core Application Files

- `src/index.ts` - Main server class and application entry point
- `src/config/index.ts` - Environment validation and configuration
- `src/middleware/security.ts` - Security middleware (auth, rate limiting, CORS)
- `src/middleware/logging.ts` - Structured logging with correlation IDs
- `src/routes/completions.ts` - Main API endpoint for Claude-to-Azure translation

### Configuration Files

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration with strict mode
- `biome.json` - Biome formatter and linter configuration
- `.env.example` - Environment variable documentation
- `docker-compose.yml` - Docker deployment configuration

### Documentation Files

- `README.md` - Project overview and quick start guide
- `docs/api-specification.yaml` - OpenAPI 3.0.3 API specification
- `docs/DEPLOYMENT.md` - Comprehensive deployment guide
- `docs/QUALITY_ASSURANCE_SUMMARY.md` - Code quality implementation summary

### Quality Assurance Files

- `vitest.config.ts` - Test configuration
- `typedoc.json` - API documentation generation
- `scripts/security-audit.sh` - Security scanning script
- `.hadolint.yaml` - Docker security scanning configuration

## Best Practices for AI Agents

### When Working with This Codebase

**General Principles:**
1. **Understand the monorepo structure** - Know which package to modify (backend, frontend, shared)
2. **Follow the layered architecture** - Respect dependency rules for each layer
3. **Use correlation IDs** for all logging and error handling (backend and frontend)
4. **Follow TypeScript strict mode** - no `any` types, explicit return types
5. **Run quality checks** before committing code (`pnpm quality:all`)
6. **Update documentation** when adding new features or changing APIs

**Backend Development:**
1. **Validate all inputs** using express-validator and Joi schemas
2. **Include comprehensive error handling** with proper HTTP status codes
3. **Use existing clients** for Azure OpenAI and AWS Bedrock integration
4. **Follow middleware patterns** for cross-cutting concerns
5. **Add tests** for all new functionality (unit, integration, security, performance)
6. **Use services layer** for business logic, not in routes directly

**Frontend Development:**
1. **Follow React best practices** - hooks, contexts, component composition
2. **Ensure accessibility** - WCAG 2.2 AAA compliance, keyboard navigation, ARIA
3. **Support internationalization** - use i18n for all user-facing text
4. **Test thoroughly** - unit tests, integration tests, accessibility tests, E2E tests
5. **Optimize performance** - virtual scrolling, lazy loading, code splitting
6. **Handle errors gracefully** - user-friendly error messages, retry logic
7. **Support offline** - IndexedDB persistence, cross-tab sync

**Shared Packages:**
1. **Keep shared-types pure** - no dependencies, only type definitions
2. **Keep shared-utils minimal** - only truly shared functionality
3. **Update shared packages carefully** - affects both backend and frontend

### Security Considerations

1. **Never expose sensitive data** in logs or error responses
2. **Always use authentication middleware** on protected routes
3. **Implement rate limiting** on all public endpoints
4. **Validate and sanitize all inputs** to prevent injection attacks
5. **Use secure defaults** and fail-fast on misconfiguration
6. **Keep dependencies updated** and scan for vulnerabilities regularly

### Performance Considerations

1. **Use connection pooling** for external API calls
2. **Implement proper timeout handling** for all async operations
3. **Monitor memory usage** and implement leak detection
4. **Use efficient data structures** and avoid unnecessary copying
5. **Implement caching** where appropriate (with proper invalidation)
6. **Profile performance** regularly and optimize bottlenecks

This reference guide provides comprehensive information for AI agents working with the
Claude-to-Azure OpenAI Proxy codebase. Follow these patterns and guidelines to maintain code
quality, security, and performance standards.
