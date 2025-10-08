---
inclusion: always
---

# Project Structure & Architecture Guidelines

## Code Organization Rules

### Module Structure

- **src/**: All TypeScript source code with strict layered architecture
- **tests/**: Comprehensive test coverage matching src/ structure
- **New files**: Always place in appropriate module directory with kebab-case naming

### Required Patterns When Adding Code

#### New Route Handlers (`src/routes/`)

- Must include input validation using express-validator
- Must use correlation IDs for request tracing
- Must implement proper error handling with sanitized responses
- Export as Express Router with typed request/response interfaces

#### New Middleware (`src/middleware/`)

- Must follow Express middleware signature: `(req, res, next) => void`
- Must include comprehensive error handling
- Must add structured logging with correlation IDs
- Export from `src/middleware/index.ts`

#### New Utilities (`src/utils/`)

- Must be pure functions with comprehensive TypeScript types
- Must include input validation and error handling
- Must be thoroughly unit tested
- Export from `src/utils/index.ts`

#### New Configuration (`src/config/`)

- Must use Joi schema validation
- Must include environment variable documentation
- Must fail-fast on invalid configuration
- Must use readonly types and frozen objects

## Architecture Enforcement

### Layered Dependencies (Strict)

1. **Routes** → Middleware, Utils, Types (no direct external API calls)
2. **Middleware** → Utils, Types, Config (cross-cutting concerns only)
3. **Utils** → Types only (pure functions, no side effects)
4. **Config** → Types only (validation and environment setup)

### Required Imports Pattern

```typescript
// External dependencies first
import express from 'express';
import { Request, Response } from 'express';

// Internal types
import { ApiRequest, ApiResponse } from '../types/index.js';

// Internal utilities
import { validateRequest } from '../utils/index.js';
```

### Error Handling Requirements

- All async functions must use try-catch with proper error transformation
- Never expose internal errors to clients
- Always include correlation IDs in error logs
- Use centralized error handler middleware for consistent responses

### Security Patterns (Mandatory)

- All routes require authentication middleware
- Input validation on all request parameters
- Rate limiting on all public endpoints
- Sanitize all error responses (no stack traces in production)

## File Creation Guidelines

### New TypeScript Files

- Use kebab-case: `new-feature.ts`
- Include comprehensive JSDoc comments
- Export interfaces from `types/index.ts`
- Follow strict TypeScript configuration

### New Test Files

- Mirror src/ structure: `src/feature.ts` → `tests/feature.test.ts`
- Use test factories from `tests/test-factories.ts`
- Include unit, integration, and security test cases
- Maintain >90% code coverage

### Configuration Files

- Environment variables in `.env.example` with documentation
- TypeScript configs must extend base configuration
- Docker files must follow multi-stage build pattern

## Code Style Enforcement

### TypeScript Requirements

- Use strict mode with all checks enabled
- Prefer `readonly` types for immutable data
- Use explicit return types on all functions
- No `any` types allowed (use `unknown` with type guards)

### Import/Export Patterns

- Use ES modules with `.js` extensions in imports
- Barrel exports from index files
- Group imports: external → types → internal utilities

### Naming Conventions

- **Files**: kebab-case (`error-handler.ts`)
- **Classes**: PascalCase (`ProxyServer`)
- **Functions/Variables**: camelCase (`validateRequest`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Types/Interfaces**: PascalCase (`ApiRequest`)

## Testing Requirements

### Test Structure

- One test file per source file
- Use describe blocks for logical grouping
- Include setup/teardown in `tests/setup.ts`
- Mock external dependencies consistently

### Required Test Categories

- **Unit**: Individual function/class testing
- **Integration**: Full request/response flow
- **Security**: Authentication and input validation
- **Error Handling**: All error paths covered
