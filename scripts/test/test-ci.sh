#!/bin/bash

# CI-specific test script for the monorepo
# Optimized for CI environments with proper exit codes and reporting

set -e

# Colors for output (disabled in CI)
if [ "$CI" = "true" ]; then
    GREEN=''
    BLUE=''
    RED=''
    YELLOW=''
    PURPLE=''
    NC=''
else
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    PURPLE='\033[0;35m'
    NC='\033[0m'
fi

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

echo "🧪 Running CI test suite..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Set CI-specific environment
export NODE_ENV=test
export CI=true

# Install dependencies
print_step "Installing dependencies..."
pnpm install --frozen-lockfile
print_status "Dependencies installed"

# Build shared packages
print_step "Building shared packages..."
pnpm build:shared
print_status "Shared packages built"

# Run type checking
print_step "Running TypeScript type checking..."
if pnpm type-check; then
    print_status "Type checking passed"
else
    print_error "Type checking failed"
    exit 1
fi

# Run linting
print_step "Running ESLint..."
if pnpm lint; then
    print_status "Linting passed"
else
    print_error "Linting failed"
    exit 1
fi

# Run tests with coverage
print_step "Running tests with coverage..."
if pnpm test:coverage; then
    print_status "All tests passed with coverage"
else
    print_error "Tests failed"
    exit 1
fi

# Run security audit
print_step "Running security audit..."
if pnpm audit --audit-level moderate; then
    print_status "Security audit passed"
else
    print_warning "Security vulnerabilities found"
    # Don't fail CI for security issues, just warn
fi

print_status "CI test suite completed successfully!"

# Output summary for CI
echo ""
echo "📊 CI Summary:"
echo "  ✅ Dependencies installed"
echo "  ✅ Shared packages built"
echo "  ✅ Type checking passed"
echo "  ✅ Linting passed"
echo "  ✅ Tests passed with coverage"
echo "  ✅ Security audit completed"