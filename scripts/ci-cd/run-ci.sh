#!/bin/bash

# Comprehensive CI script for monorepo
# Can be run locally or in CI environments

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

print_header() {
    echo ""
    echo "=================================================="
    echo "$1"
    echo "=================================================="
}

# Parse command line arguments
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_LINT=false
COVERAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-tests    Skip running tests"
            echo "  --skip-build    Skip building packages"
            echo "  --skip-lint     Skip linting and type checking"
            echo "  --coverage      Generate coverage reports"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header "🚀 Starting CI Pipeline for Monorepo"

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Set environment variables
export NODE_ENV=test
if [ "$CI" != "true" ]; then
    export CI=false
fi

print_info "Environment: NODE_ENV=$NODE_ENV, CI=$CI"

# Step 1: Install dependencies
print_header "📦 Installing Dependencies"
print_step "Installing workspace dependencies..."

if [ "$CI" = "true" ]; then
    pnpm install --frozen-lockfile
else
    pnpm install
fi

print_status "Dependencies installed successfully"

# Step 2: Build packages
if [ "$SKIP_BUILD" = false ]; then
    print_header "🏗️  Building Packages"
    
    print_step "Building shared packages..."
    pnpm build:shared
    print_status "Shared packages built"
    
    print_step "Building applications..."
    if [ -d "apps/backend" ]; then
        pnpm build:backend
        print_status "Backend built"
    fi
    
    if [ -d "apps/frontend" ]; then
        pnpm build:frontend
        print_status "Frontend built"
    fi
    
    print_status "All packages built successfully"
else
    print_warning "Skipping build step"
fi

# Step 3: Code quality checks
if [ "$SKIP_LINT" = false ]; then
    print_header "🔍 Code Quality Checks"
    
    print_step "Running TypeScript type checking..."
    if pnpm type-check; then
        print_status "Type checking passed"
    else
        print_error "Type checking failed"
        exit 1
    fi
    
    print_step "Running ESLint..."
    if pnpm lint; then
        print_status "Linting passed"
    else
        print_error "Linting failed"
        print_info "Run 'pnpm lint:fix' to fix automatically fixable issues"
        exit 1
    fi
    
    print_step "Checking code formatting..."
    if pnpm format:check; then
        print_status "Code formatting is correct"
    else
        print_error "Code formatting issues found"
        print_info "Run 'pnpm format' to fix formatting issues"
        exit 1
    fi
    
    print_status "All code quality checks passed"
else
    print_warning "Skipping code quality checks"
fi

# Step 4: Run tests
if [ "$SKIP_TESTS" = false ]; then
    print_header "🧪 Running Tests"
    
    if [ "$COVERAGE" = true ]; then
        print_step "Running tests with coverage..."
        if pnpm test:coverage; then
            print_status "All tests passed with coverage"
            print_info "Coverage reports generated in coverage/ directories"
        else
            print_error "Tests failed"
            exit 1
        fi
    else
        print_step "Running tests..."
        if pnpm test; then
            print_status "All tests passed"
        else
            print_error "Tests failed"
            exit 1
        fi
    fi
else
    print_warning "Skipping tests"
fi

# Step 5: Security checks
print_header "🔒 Security Checks"

print_step "Running dependency audit..."
if pnpm audit --audit-level moderate; then
    print_status "No security vulnerabilities found"
else
    print_warning "Security vulnerabilities found in dependencies"
    print_info "Review the audit results and update dependencies as needed"
    # Don't fail CI for security issues, just warn
fi

# Step 6: Build verification
if [ "$SKIP_BUILD" = false ]; then
    print_header "✅ Build Verification"
    
    print_step "Verifying build artifacts..."
    
    # Check shared packages
    ARTIFACTS_MISSING=false
    for pkg in shared-types shared-utils shared-config; do
        if [ -d "packages/$pkg/dist" ] || [ -d "packages/$pkg/lib" ]; then
            print_info "✅ packages/$pkg build artifacts found"
        else
            print_error "❌ packages/$pkg build artifacts missing"
            ARTIFACTS_MISSING=true
        fi
    done
    
    # Check applications
    if [ -d "apps/backend/dist" ]; then
        print_info "✅ apps/backend build artifacts found"
    else
        print_error "❌ apps/backend build artifacts missing"
        ARTIFACTS_MISSING=true
    fi
    
    if [ -d "apps/frontend/dist" ]; then
        print_info "✅ apps/frontend build artifacts found"
    else
        print_error "❌ apps/frontend build artifacts missing"
        ARTIFACTS_MISSING=true
    fi
    
    if [ "$ARTIFACTS_MISSING" = true ]; then
        print_error "Some build artifacts are missing"
        exit 1
    else
        print_status "All build artifacts verified"
    fi
else
    print_warning "Skipping build verification"
fi

# Step 7: Final summary
print_header "🎉 CI Pipeline Summary"

print_status "CI pipeline completed successfully!"
echo ""
print_info "Summary of completed steps:"
if [ "$SKIP_BUILD" = false ]; then
    echo "  ✅ Dependencies installed"
    echo "  ✅ Packages built"
fi
if [ "$SKIP_LINT" = false ]; then
    echo "  ✅ Type checking passed"
    echo "  ✅ Linting passed"
    echo "  ✅ Code formatting verified"
fi
if [ "$SKIP_TESTS" = false ]; then
    if [ "$COVERAGE" = true ]; then
        echo "  ✅ Tests passed with coverage"
    else
        echo "  ✅ Tests passed"
    fi
fi
echo "  ✅ Security audit completed"
if [ "$SKIP_BUILD" = false ]; then
    echo "  ✅ Build artifacts verified"
fi

echo ""
print_info "Ready for deployment!"

# Exit with success
exit 0