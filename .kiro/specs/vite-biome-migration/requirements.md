# Requirements Document

## Introduction

This document outlines the requirements for migrating the Claude-to-Azure OpenAI Proxy monorepo to use modern, high-performance tooling. The migration has two phases:

**Phase 1 (Immediate)**: Migrate from ESLint + Prettier to Biome for linting and formatting. Biome is a fast, all-in-one toolchain that combines linting and formatting with significantly better performance than ESLint + Prettier.

**Phase 2 (Future)**: Prepare for Vite+ adoption when it becomes available (early 2026). Vite+ is a unified toolchain that includes `vite lint` (Oxlint), `vite fmt` (Oxfmt), `vite test` (Vitest), and other integrated tools. Since Vite+ is not yet publicly available, this spec focuses on Biome migration now, with architecture decisions that facilitate future Vite+ adoption.

The frontend already uses Vite 7 for building, so this migration focuses on consolidating linting and formatting tooling across the entire monorepo (frontend, backend, and shared packages).

## Glossary

- **Biome**: A fast, all-in-one toolchain for linting and formatting JavaScript, TypeScript, JSON, and other web languages
- **Vite+**: A unified toolchain (in development, early 2026) that includes vite lint (Oxlint), vite fmt (Oxfmt), vite test (Vitest), and other integrated tools
- **Oxlint**: The linter used by Vite+, 100x faster than ESLint with 600+ ESLint-compatible rules
- **Oxfmt**: The formatter used by Vite+, 99%+ Prettier-compatible with better performance
- **ESLint**: Current JavaScript/TypeScript linter being replaced
- **Prettier**: Current code formatter being replaced
- **Monorepo**: A repository containing multiple packages (apps/backend, apps/frontend, packages/*)
- **Workspace**: A pnpm workspace containing multiple packages
- **Linting**: Static code analysis to identify problematic patterns
- **Formatting**: Automatic code style enforcement
- **Migration**: The process of transitioning from ESLint + Prettier to Biome (and eventually Vite+)
- **Configuration File**: biome.json or biome.jsonc file that defines Biome settings
- **IDE Integration**: Editor plugins that provide real-time linting and formatting
- **CI/CD**: Continuous Integration/Continuous Deployment pipelines
- **Type Safety**: TypeScript strict mode enforcement
- **Security Rules**: Linting rules that detect security vulnerabilities

## Requirements

### Requirement 1

**User Story:** As a developer, I want to install and configure Biome in the monorepo, so that I can use a single tool for linting and formatting.

#### Acceptance Criteria

1. WHEN Biome is installed THEN the system SHALL add @biomejs/biome as a devDependency in the root package.json
2. WHEN Biome is configured THEN the system SHALL create a biome.json configuration file at the repository root
3. WHEN Biome is configured THEN the system SHALL extend the root configuration in workspace-specific biome.json files where needed
4. WHEN Biome is installed THEN the system SHALL maintain compatibility with Node.js 24+ and pnpm workspace structure
5. WHEN Biome configuration is created THEN the system SHALL define formatter settings that match current Prettier configuration

### Requirement 2

**User Story:** As a developer, I want Biome to enforce the same code quality standards as ESLint, so that code quality is maintained during migration.

#### Acceptance Criteria

1. WHEN Biome linting rules are configured THEN the system SHALL enable all recommended rules by default
2. WHEN Biome linting rules are configured THEN the system SHALL enable security-focused rules equivalent to eslint-plugin-security
3. WHEN Biome linting rules are configured THEN the system SHALL enforce TypeScript strict mode rules
4. WHEN Biome linting rules are configured THEN the system SHALL configure rules to match current ESLint security standards
5. WHEN Biome linting rules are configured THEN the system SHALL allow workspace-specific rule overrides for frontend and backend

### Requirement 3

**User Story:** As a developer, I want Biome to format code consistently across the monorepo, so that code style is uniform.

#### Acceptance Criteria

1. WHEN Biome formatter is configured THEN the system SHALL use semicolons (matching current Prettier config)
2. WHEN Biome formatter is configured THEN the system SHALL use single quotes (matching current Prettier config)
3. WHEN Biome formatter is configured THEN the system SHALL use 2-space indentation (matching current Prettier config)
4. WHEN Biome formatter is configured THEN the system SHALL set line width to 80 characters (matching current Prettier config)
5. WHEN Biome formatter is configured THEN the system SHALL use trailing commas for ES5 compatibility (matching current Prettier config)

### Requirement 4

**User Story:** As a developer, I want to migrate package.json scripts from ESLint/Prettier to Biome, so that I can use consistent commands.

#### Acceptance Criteria

1. WHEN package.json scripts are updated THEN the system SHALL replace "lint" scripts with "biome lint" commands
2. WHEN package.json scripts are updated THEN the system SHALL replace "lint:fix" scripts with "biome lint --write" commands
3. WHEN package.json scripts are updated THEN the system SHALL replace "format" scripts with "biome format --write" commands
4. WHEN package.json scripts are updated THEN the system SHALL replace "format:check" scripts with "biome format" commands
5. WHEN package.json scripts are updated THEN the system SHALL add a "check" script that runs both linting and formatting validation
6. WHEN package.json scripts are updated THEN the system SHALL add a "check:fix" script that runs both linting and formatting with auto-fix

### Requirement 5

**User Story:** As a developer, I want to remove ESLint and Prettier dependencies, so that the project uses only Biome for code quality.

#### Acceptance Criteria

1. WHEN ESLint dependencies are removed THEN the system SHALL remove eslint, @typescript-eslint/*, and eslint-plugin-* packages
2. WHEN Prettier dependencies are removed THEN the system SHALL remove prettier package from all package.json files
3. WHEN ESLint configuration is removed THEN the system SHALL delete eslint.config.ts files from root and workspaces
4. WHEN Prettier configuration is removed THEN the system SHALL delete .prettierrc and .prettierignore files
5. WHEN dependencies are removed THEN the system SHALL update lint-staged configuration to use Biome commands

### Requirement 6

**User Story:** As a developer, I want Biome to integrate with my IDE, so that I get real-time linting and formatting feedback.

#### Acceptance Criteria

1. WHEN IDE integration is documented THEN the system SHALL provide VS Code extension recommendations in .vscode/extensions.json
2. WHEN IDE integration is documented THEN the system SHALL provide VS Code settings in .vscode/settings.json for Biome
3. WHEN IDE integration is documented THEN the system SHALL document how to enable format-on-save with Biome
4. WHEN IDE integration is documented THEN the system SHALL document how to disable ESLint and Prettier extensions
5. WHEN IDE integration is documented THEN the system SHALL provide instructions for other popular IDEs (WebStorm, Sublime Text)

### Requirement 7

**User Story:** As a developer, I want Biome to run in CI/CD pipelines, so that code quality is enforced automatically.

#### Acceptance Criteria

1. WHEN CI/CD scripts are updated THEN the system SHALL replace ESLint commands with Biome lint commands
2. WHEN CI/CD scripts are updated THEN the system SHALL replace Prettier commands with Biome format commands
3. WHEN CI/CD scripts are updated THEN the system SHALL use "biome ci" command for comprehensive CI checks
4. WHEN CI/CD scripts are updated THEN the system SHALL configure Biome to output results in CI-friendly format
5. WHEN CI/CD scripts are updated THEN the system SHALL ensure Biome checks run before tests in the pipeline

### Requirement 8

**User Story:** As a developer, I want to configure Biome ignore patterns, so that generated files and dependencies are excluded from checks.

#### Acceptance Criteria

1. WHEN ignore patterns are configured THEN the system SHALL exclude node_modules directories
2. WHEN ignore patterns are configured THEN the system SHALL exclude dist and build output directories
3. WHEN ignore patterns are configured THEN the system SHALL exclude coverage directories
4. WHEN ignore patterns are configured THEN the system SHALL exclude .git and .kiro directories
5. WHEN ignore patterns are configured THEN the system SHALL exclude generated TypeScript declaration files (*.d.ts)

### Requirement 9

**User Story:** As a developer, I want Biome to validate JSON and other configuration files, so that all project files maintain quality standards.

#### Acceptance Criteria

1. WHEN Biome is configured THEN the system SHALL enable JSON linting and formatting
2. WHEN Biome is configured THEN the system SHALL validate package.json files for correctness
3. WHEN Biome is configured THEN the system SHALL validate tsconfig.json files for correctness
4. WHEN Biome is configured THEN the system SHALL format JSON files with consistent indentation
5. WHEN Biome is configured THEN the system SHALL detect and report JSON syntax errors

### Requirement 10

**User Story:** As a developer, I want comprehensive migration documentation, so that I can understand the changes and troubleshoot issues.

#### Acceptance Criteria

1. WHEN migration documentation is created THEN the system SHALL document all breaking changes from ESLint to Biome
2. WHEN migration documentation is created THEN the system SHALL provide a comparison of ESLint rules to Biome rules
3. WHEN migration documentation is created THEN the system SHALL document how to run Biome commands
4. WHEN migration documentation is created THEN the system SHALL document how to configure IDE integration
5. WHEN migration documentation is created THEN the system SHALL provide troubleshooting guidance for common issues

### Requirement 11

**User Story:** As a developer, I want the migration to be compatible with future Vite+ adoption, so that transitioning to Vite+ is seamless when it becomes available.

#### Acceptance Criteria

1. WHEN Biome configuration is created THEN the system SHALL use configuration patterns that align with Vite+ philosophy
2. WHEN package.json scripts are updated THEN the system SHALL use naming conventions compatible with future vite lint and vite fmt commands
3. WHEN migration documentation is created THEN the system SHALL document the future migration path to Vite+ (Oxlint and Oxfmt)
4. WHEN Biome is configured THEN the system SHALL maintain compatibility with Vitest (already used in the project)
5. WHEN migration is complete THEN the system SHALL document expected benefits of future Vite+ adoption (100x faster linting, 99%+ Prettier compatibility)
