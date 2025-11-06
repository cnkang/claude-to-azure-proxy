#!/bin/bash

# Comprehensive test script for the monorepo
# Runs all tests across all packages with proper reporting

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

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

echo "🧪 Running comprehensive test suite..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Function to run tests for a package
run_package_tests() {
    local package_name=$1
    local package_path=$2
    
    if [ -d "$package_path" ]; then
        print_step "Running tests for $package_name..."
        
        if pnpm --filter "@repo/$package_name" test --run; then
            print_status "$package_name tests passed"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            print_error "$package_name tests failed"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
        
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    else
        print_info "$package_name not found, skipping tests..."
        SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
    fi
}

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    print_step "Installing dependencies..."
    pnpm install
fi

# Build shared packages first (required for tests)
print_step "Building shared packages for testing..."
pnpm build:shared

# Run tests for shared packages
print_info "Testing shared packages..."
run_package_tests "shared-types" "packages/shared-types"
run_package_tests "shared-utils" "packages/shared-utils"
run_package_tests "shared-config" "packages/shared-config"

# Run tests for applications
print_info "Testing applications..."
run_package_tests "backend" "apps/backend"
run_package_tests "frontend" "apps/frontend"

# Generate coverage report if requested
if [ "$1" = "--coverage" ] || [ "$1" = "-c" ]; then
    print_step "Generating coverage report..."
    if pnpm test:coverage; then
        print_status "Coverage report generated"
        print_info "Coverage reports available in coverage/ directories"
    else
        print_warning "Coverage report generation failed"
    fi
fi

# Print test summary
echo ""
echo "📊 Test Summary:"
echo "  Total packages tested: $TOTAL_TESTS"
echo "  Passed: $PASSED_TESTS"
echo "  Failed: $FAILED_TESTS"
echo "  Skipped: $SKIPPED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    print_status "All tests passed successfully!"
    exit 0
else
    print_error "$FAILED_TESTS package(s) have failing tests"
    exit 1
fi