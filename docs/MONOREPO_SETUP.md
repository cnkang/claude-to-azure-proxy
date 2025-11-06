# Monorepo Setup Guide

## Overview

This document describes the optimized monorepo directory structure that has been implemented for the
Claude-to-Azure OpenAI proxy project. The new structure follows industry best practices and provides
better organization, maintainability, and scalability.

## Directory Structure

```
claude-to-azure-proxy/
├── README.md                          # Main project documentation
├── LICENSE                           # Project license
├── .gitignore                        # Git ignore rules
├── .nvmrc                           # Node.js version specification
├── package.json                     # Root package.json for workspace management
├── pnpm-workspace.yaml              # pnpm workspace configuration
├── docker-compose.yml               # Development environment
├── docker-compose.prod.yml          # Production environment
├── Makefile                         # Build and deployment commands
│
├── apps/                            # Application packages
│   ├── backend/                     # Backend API service
│   │   ├── src/                     # TypeScript source code
│   │   ├── tests/                   # Backend test files
│   │   ├── dist/                    # Compiled JavaScript output
│   │   ├── package.json             # Backend dependencies
│   │   ├── tsconfig.json            # TypeScript configuration
│   │   ├── vitest.config.ts         # Test configuration
│   │   └── Dockerfile               # Backend container definition
│   │
│   └── frontend/                    # React web application
│       ├── src/                     # React source code
│       ├── public/                  # Static public assets
│       ├── dist/                    # Built frontend assets
│       ├── tests/                   # Frontend test files
│       ├── package.json             # Frontend dependencies
│       ├── tsconfig.json            # TypeScript configuration
│       ├── vite.config.ts           # Vite build configuration
│       ├── vitest.config.ts         # Test configuration
│       └── index.html               # HTML template
│
├── packages/                        # Shared packages
│   ├── shared-types/                # Shared TypeScript types
│   │   ├── src/                     # Type definitions
│   │   ├── dist/                    # Compiled types
│   │   ├── package.json             # Package configuration
│   │   └── tsconfig.json            # TypeScript configuration
│   │
│   ├── shared-utils/                # Shared utility functions
│   │   ├── src/                     # Utility implementations
│   │   ├── tests/                   # Utility tests
│   │   ├── dist/                    # Compiled utilities
│   │   ├── package.json             # Package configuration
│   │   ├── tsconfig.json            # TypeScript configuration
│   │   └── vitest.config.ts         # Test configuration
│   │
│   └── shared-config/               # Shared configuration
│       ├── eslint/                  # ESLint configurations
│       ├── typescript/              # TypeScript configurations
│       ├── vitest/                  # Test configurations
│       └── package.json             # Package configuration
│
├── docs/                            # Project documentation
│   ├── api/                         # API documentation
│   ├── deployment/                  # Deployment guides
│   ├── architecture/                # Architecture documentation
│   ├── user-guide/                  # User documentation
│   └── developer-guide/             # Developer documentation
│
├── scripts/                         # Build and deployment scripts
│   ├── build/                       # Build scripts
│   ├── deploy/                      # Deployment scripts
│   ├── dev/                         # Development scripts
│   └── test/                        # Testing scripts
│
├── infra/                           # Infrastructure as Code
│   ├── docker/                      # Docker configurations
│   ├── k8s/                         # Kubernetes manifests
│   ├── terraform/                   # Terraform configurations
│   └── monitoring/                  # Monitoring configurations
│
├── tools/                           # Development tools and utilities
│   ├── generators/                  # Code generators
│   ├── linters/                     # Custom linting rules
│   └── build-tools/                 # Custom build utilities
│
└── .github/                         # GitHub-specific files
    ├── workflows/                   # CI/CD workflows
    ├── ISSUE_TEMPLATE/              # Issue templates
    ├── PULL_REQUEST_TEMPLATE.md     # PR template
    └── dependabot.yml               # Dependency updates
```

## Key Features

### Workspace Management

- **pnpm workspaces** for efficient dependency management
- **Shared packages** for common types, utilities, and configurations
- **Independent versioning** for applications
- **Workspace dependencies** using `workspace:*` protocol

### Applications

#### Backend (`apps/backend`)

- Express.js API server
- TypeScript with strict configuration
- Comprehensive test suite with Vitest
- Docker multi-stage build
- Production-ready with security hardening

#### Frontend (`apps/frontend`)

- React 19.2 with TypeScript
- Vite for fast development and optimized builds
- Modern testing setup with Vitest and Testing Library
- Responsive design with accessibility support
- i18n support for multiple languages

### Shared Packages

#### `@repo/shared-types`

- Common TypeScript interfaces and types
- API request/response types
- Configuration types
- Model and session types

#### `@repo/shared-utils`

- Utility functions for correlation IDs
- Request context creation
- Error handling utilities
- Environment variable parsing
- Validation helpers

#### `@repo/shared-config`

- Centralized ESLint configuration
- TypeScript base configuration
- Vitest test configuration
- Consistent tooling across packages

## Development Commands

### Installation

```bash
# Install all dependencies
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

### Code Quality

```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Type checking
pnpm type-check
```

## Docker Support

### Development Environment

```bash
# Start development environment
docker-compose up

# Build and start
docker-compose up --build
```

### Production Environment

```bash
# Start production environment
docker-compose -f docker-compose.prod.yml up

# Build and start production
docker-compose -f docker-compose.prod.yml up --build
```

## Migration Benefits

### Developer Experience

- **Unified tooling**: Consistent configurations across all packages
- **Faster development**: Hot reloading and optimized build processes
- **Type safety**: Shared types ensure consistency
- **Better IDE support**: Improved IntelliSense and navigation

### Maintainability

- **Clear boundaries**: Separation between applications and shared code
- **Dependency management**: Explicit dependencies between packages
- **Code reuse**: Shared utilities and configurations
- **Consistent patterns**: Standardized project structure

### Scalability

- **Independent deployment**: Applications can be deployed separately
- **Horizontal scaling**: Easy to add new applications or services
- **Modular architecture**: Clear separation of concerns
- **Infrastructure as Code**: Centralized deployment configurations

## Next Steps

1. **Code Migration**: Move existing backend and frontend code to the new structure
2. **Import Updates**: Update import paths to use workspace dependencies
3. **CI/CD Updates**: Modify build pipelines to work with monorepo structure
4. **Documentation**: Update deployment and development documentation
5. **Testing**: Verify all functionality works with the new structure

## Scripts Available

- `scripts/migrate-to-monorepo.sh`: Migration helper script
- `scripts/build/build-all.sh`: Comprehensive build script
- `scripts/dev/start-dev.sh`: Development environment startup

This monorepo structure provides a solid foundation for the web frontend implementation while
maintaining the existing API functionality and improving overall project organization.
