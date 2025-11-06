---
inclusion: always
---

# Technology Stack & Development Guidelines

## Core Stack Requirements

- **Runtime**: Node.js 24+ with ES Modules (ESM) - use `.js` extensions in imports
- **Language**: TypeScript 5.3+ with strict mode - no `any` types, explicit return types required
- **Framework**: Express.js - always use typed Request/Response interfaces
- **Package Manager**: pnpm (preferred) - use `pnpm` commands in scripts and documentation
- **Testing**: Vitest with happy-dom environment and >90% coverage requirement

## Critical Dependencies & Usage Patterns

### HTTP & Security

- **axios**: For Azure OpenAI API calls - always include timeout and retry logic
- **helmet**: Apply to all routes - never disable security headers
- **express-rate-limit**: Required on all public endpoints
- **express-validator**: Validate all request inputs - use schema-based validation

### Configuration & Validation

- **joi**: Schema validation for environment variables - fail-fast on invalid config
- **dotenv**: Load environment variables - validate at startup, not runtime
- **uuid**: Generate correlation IDs for all requests - include in logs and error responses

## Development Commands (Use These)

```bash
# Development workflow
pnpm dev              # Hot reload development server
pnpm build            # TypeScript compilation to dist/
pnpm start            # Production server from dist/

# Testing workflow
pnpm test             # Run all tests once
pnpm test:coverage    # Generate coverage report (>90% required)

# Code quality (run before commits)
pnpm lint:fix         # Auto-fix ESLint issues
pnpm format           # Format with Prettier
pnpm quality:all      # Run all quality checks
```

## TypeScript Patterns (Enforce These)

### Import/Export Rules

```typescript
// Always use .js extensions in imports
import { validateRequest } from '../utils/validation.js';
import type { ApiRequest } from '../types/index.js';

// Group imports: external → types → internal
import express from 'express';
import type { Request, Response } from 'express';
import type { ApiRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';
```

### Type Safety Requirements

- Use `readonly` for immutable data structures
- Explicit return types on all functions
- Use `unknown` instead of `any` with type guards
- Prefer interfaces over types for object shapes

### Error Handling Pattern

```typescript
// Always use this pattern for async operations
try {
  const result = await externalApiCall();
  return transformResponse(result);
} catch (error) {
  logger.error('Operation failed', { correlationId, error });
  throw new ApiError('Operation failed', 500);
}
```

## Configuration Standards

### Environment Variables

- Validate all env vars at startup using Joi schemas
- Use `.env.example` for documentation
- Never expose secrets in logs or error responses
- Default to secure values, fail if required vars missing

### Docker Requirements

- Use `node:24-alpine` base image
- Multi-stage builds: deps → builder → runner
- Non-root user with minimal privileges
- Health check endpoint at `/health`

## Testing Requirements

### Test Structure

- Mirror `src/` structure in `tests/`
- Use test factories from `tests/test-factories.ts`
- Include unit, integration, and security tests
- Mock external dependencies consistently

### Coverage Targets

- Minimum 90% code coverage
- 100% coverage for critical security functions
- Test all error paths and edge cases
- Include performance and load testing for API endpoints
