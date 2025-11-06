# Monorepo Structure Documentation

## Overview

This project follows a modern monorepo architecture using pnpm workspaces to manage multiple
applications and shared packages efficiently.

## Directory Structure

```
claude-to-azure-proxy/
├── apps/                    # Application packages
│   ├── backend/            # Express.js API server
│   └── frontend/           # React web application
├── packages/               # Shared packages
│   ├── shared-types/       # TypeScript type definitions
│   ├── shared-utils/       # Utility functions
│   └── shared-config/      # Configuration files
├── infra/                  # Infrastructure as Code
│   ├── docker/            # Docker configurations
│   ├── k8s/               # Kubernetes manifests
│   └── monitoring/        # Monitoring configurations
├── docs/                   # Documentation
├── scripts/                # Build and deployment scripts
└── tools/                  # Development tools
```

## Package Dependencies

### Workspace Dependencies

- `@repo/backend` depends on:
  - `@repo/shared-types`
  - `@repo/shared-utils`
  - `@repo/shared-config`

- `@repo/frontend` depends on:
  - `@repo/shared-types`
  - `@repo/shared-utils`
  - `@repo/shared-config`

### Shared Packages

- `@repo/shared-types`: Common TypeScript interfaces and types
- `@repo/shared-utils`: Utility functions used across applications
- `@repo/shared-config`: ESLint, TypeScript, and Vitest configurations

## Development Workflow

### Installation

```bash
# Install all dependencies for all packages
pnpm install
```

### Building

```bash
# Build all packages
pnpm build

# Build specific packages
pnpm build:backend
pnpm build:frontend
pnpm build:shared
```

### Development

```bash
# Start backend development server
pnpm dev

# Start frontend development server
pnpm dev:frontend

# Start both backend and frontend
pnpm dev:all
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific packages
pnpm test:backend
pnpm test:frontend
pnpm test:shared
```

### Linting and Formatting

```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Docker Support

### Development

```bash
# Start development environment
docker-compose up

# Build and start
docker-compose up --build
```

### Production

```bash
# Start production environment
docker-compose -f docker-compose.prod.yml up

# Build and start production
docker-compose -f docker-compose.prod.yml up --build
```

## Benefits

### Developer Experience

- **Unified tooling**: Consistent ESLint, TypeScript, and testing configurations
- **Shared dependencies**: Reduced duplication and faster installs
- **Type safety**: Shared types ensure consistency across applications
- **Hot reloading**: Fast development with automatic rebuilds

### Maintainability

- **Clear boundaries**: Separation between applications and shared code
- **Dependency management**: Explicit dependencies between packages
- **Code reuse**: Shared utilities and configurations
- **Consistent patterns**: Standardized project structure

### Deployment

- **Independent builds**: Applications can be built and deployed separately
- **Optimized containers**: Multi-stage Docker builds for production
- **Scalability**: Easy to add new applications or services
- **Infrastructure as Code**: Centralized deployment configurations

## Migration Notes

This structure represents a migration from a single-package structure to a monorepo. The migration
maintains backward compatibility while providing the benefits of a modern monorepo architecture.

### Key Changes

1. **Backend code** moved from `src/` to `apps/backend/src/`
2. **Frontend code** moved from `frontend/` to `apps/frontend/`
3. **Shared code** extracted to `packages/shared-*`
4. **Docker configurations** updated for multi-service deployment
5. **Build scripts** updated to work with workspace structure
