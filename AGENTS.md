# AI Agent Reference Guide for Claude-to-Azure OpenAI Proxy

## Project Overview

This is a **production-ready TypeScript API proxy server** that seamlessly translates Claude API requests to Azure OpenAI format, enabling Claude Code CLI to work with Azure OpenAI services. The project follows enterprise-grade security, comprehensive monitoring, and production-ready resilience patterns.

### Core Purpose
- **API Translation**: Bidirectional request/response transformation between Claude and Azure OpenAI formats
- **Security Gateway**: Enterprise-grade authentication, rate limiting, and input validation
- **Production Ready**: Comprehensive monitoring, health checks, and resilience features
- **Cloud Optimized**: Designed for AWS App Runner deployment with Docker support

## Technology Stack & Architecture

### Core Technologies
- **Runtime**: Node.js 22+ with ES Modules (ESM)
- **Language**: TypeScript 5.3+ with strict mode (no `any` types)
- **Framework**: Express.js with typed Request/Response interfaces
- **Package Manager**: pnpm (preferred)
- **Testing**: Vitest with >90% coverage requirement

### Key Dependencies
- **axios**: Azure OpenAI API calls with timeout and retry logic
- **helmet**: Security headers (never disable)
- **express-rate-limit**: Required on all public endpoints
- **express-validator**: Schema-based input validation
- **joi**: Environment variable validation (fail-fast)
- **uuid**: Correlation IDs for request tracing

## Project Structure

```
src/
├── config/          # Environment validation with Joi schemas
├── controllers/     # Request handlers (if any)
├── errors/          # Custom error classes
├── index.ts         # Main application entry point
├── middleware/      # Express middleware (security, logging, auth)
├── monitoring/      # Health checks, metrics, performance profiling
├── resilience/      # Circuit breakers, retry logic, graceful degradation
├── routes/          # API route handlers
├── types/           # TypeScript type definitions
└── utils/           # Pure utility functions

tests/               # Comprehensive test coverage (325+ tests)
docs/               # API specification and deployment guides
scripts/            # Security and quality assurance scripts
```

### Architecture Layers (Strict Dependencies)
1. **Routes** → Middleware, Utils, Types (no direct external API calls)
2. **Middleware** → Utils, Types, Config (cross-cutting concerns only)
3. **Utils** → Types only (pure functions, no side effects)
4. **Config** → Types only (validation and environment setup)

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
```typescript
try {
  const result = await externalApiCall();
  return transformResponse(result);
} catch (error) {
  logger.error('Operation failed', { correlationId, error });
  throw new ApiError('Operation failed', 500);
}
```

### Naming Conventions
- **Files**: kebab-case (`error-handler.ts`)
- **Classes**: PascalCase (`ProxyServer`)
- **Functions/Variables**: camelCase (`validateRequest`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Types/Interfaces**: PascalCase (`ApiRequest`)

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
  "correlationId": "uuid-v4-correlation-id",
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

# Security and documentation
pnpm quality:security # Comprehensive security audit
pnpm docs:generate    # Generate TypeScript API documentation
```

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

### Test Categories
- **Unit**: Individual function/class testing
- **Integration**: Full request/response flow
- **Security**: Authentication and input validation
- **Error Handling**: All error paths covered

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
  "version": "1.0.0",
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
- `node:22-alpine` base image
- Non-root user with minimal privileges
- Security scanning with hadolint

### Configuration
- Validate all environment variables at startup
- Support both development and production patterns
- Use secure defaults and fail-fast on misconfiguration

## Code Quality Standards

### Quality Assurance Tools
- **TypeScript**: Strict mode with comprehensive type checking
- **ESLint**: Security-focused linting with automated fixes
- **Prettier**: Consistent code formatting
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

### Model Mapping
- Claude models map to appropriate Azure OpenAI models
- Maintain model capability parity (context length, features)
- Handle unsupported model requests gracefully

### Request/Response Transformation
- Preserve all Claude API semantics in transformations
- Handle streaming responses identically to Claude API behavior
- Maintain request correlation and timing characteristics
- Transform error responses to match Claude API error format

### Performance Requirements
- Target sub-100ms proxy overhead for non-streaming requests
- Support concurrent requests with proper resource management
- Implement efficient memory usage for streaming responses

## Common Patterns

### Adding New Routes
```typescript
// src/routes/new-feature.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import type { RequestWithCorrelationId } from '../types/index.js';

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
          correlationId
        }
      });
    }
    
    try {
      // Business logic here
      const result = await processRequest(req.body);
      res.json({ result, correlationId });
    } catch (error) {
      logger.error('Request failed', correlationId, { error });
      res.status(500).json({
        error: {
          type: 'internal_error',
          message: 'Request processing failed',
          correlationId
        }
      });
    }
  }
];
```

### Adding New Middleware
```typescript
// src/middleware/new-middleware.ts
import type { Request, Response, NextFunction } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from './logging.js';

export const newMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;
  
  try {
    // Middleware logic here
    logger.info('Middleware executed', correlationId);
    next();
  } catch (error) {
    logger.error('Middleware error', correlationId, { error });
    next(error);
  }
};
```

### Adding New Utilities
```typescript
// src/utils/new-utility.ts
import type { SomeType } from '../types/index.js';

/**
 * Utility function description
 * @param input - Input parameter description
 * @returns Return value description
 * @throws {Error} When validation fails
 */
export const newUtility = (input: SomeType): string => {
  if (!input) {
    throw new Error('Input is required');
  }
  
  // Pure function logic here
  return processInput(input);
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
- `eslint.config.ts` - ESLint configuration with security rules
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
1. **Always follow the layered architecture** - Routes → Middleware → Utils → Types
2. **Use correlation IDs** for all logging and error handling
3. **Validate all inputs** using express-validator and Joi schemas
4. **Follow TypeScript strict mode** - no `any` types, explicit return types
5. **Include comprehensive error handling** with proper HTTP status codes
6. **Add tests** for all new functionality (unit, integration, security)
7. **Update documentation** when adding new features or changing APIs
8. **Run quality checks** before committing code (`pnpm quality:all`)

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

This reference guide provides comprehensive information for AI agents working with the Claude-to-Azure OpenAI Proxy codebase. Follow these patterns and guidelines to maintain code quality, security, and performance standards.