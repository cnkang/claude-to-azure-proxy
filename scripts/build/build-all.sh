#!/bin/bash

# Comprehensive build script for the monorepo
# Builds all packages in the correct order with workspace awareness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

echo "🏗️  Building monorepo packages..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is required but not installed. Please install pnpm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_step "Installing workspace dependencies..."
    pnpm install
    print_status "Dependencies installed"
fi

# Clean previous builds
print_step "Cleaning previous builds..."
pnpm build:clean 2>/dev/null || true
print_status "Previous builds cleaned"

# Build shared packages first (they are dependencies for apps)
print_step "Building shared packages..."
if pnpm build:shared; then
    print_status "Shared packages built successfully"
else
    print_error "Failed to build shared packages"
    exit 1
fi

# Build applications in dependency order
print_step "Building backend application..."
if [ -d "apps/backend" ]; then
    if pnpm build:backend; then
        print_status "Backend application built successfully"
    else
        print_error "Failed to build backend application"
        exit 1
    fi
else
    print_warning "Backend app not found, skipping..."
fi

print_step "Building frontend application..."
if [ -d "apps/frontend" ]; then
    if pnpm build:frontend; then
        print_status "Frontend application built successfully"
    else
        print_error "Failed to build frontend application"
        exit 1
    fi
else
    print_warning "Frontend app not found, skipping..."
fi

# Run quality checks
print_step "Running TypeScript type checking..."
if pnpm type-check; then
    print_status "Type checking passed"
else
    print_error "Type checking failed"
    exit 1
fi

print_step "Running linting..."
if pnpm lint; then
    print_status "Linting passed"
else
    print_warning "Linting issues found. Run 'pnpm lint:fix' to fix automatically."
fi

# Verify build artifacts
print_step "Verifying build artifacts..."
ARTIFACTS_FOUND=true

# Check shared packages
for pkg in shared-types shared-utils shared-config; do
    if [ -d "packages/$pkg/dist" ] || [ -d "packages/$pkg/lib" ]; then
        echo "  ✅ packages/$pkg/dist"
    else
        echo "  ❌ packages/$pkg/dist (missing)"
        ARTIFACTS_FOUND=false
    fi
done

# Check applications
if [ -d "apps/backend/dist" ]; then
    echo "  ✅ apps/backend/dist"
else
    echo "  ❌ apps/backend/dist (missing)"
    ARTIFACTS_FOUND=false
fi

if [ -d "apps/frontend/dist" ]; then
    echo "  ✅ apps/frontend/dist"
else
    echo "  ❌ apps/frontend/dist (missing)"
    ARTIFACTS_FOUND=false
fi

if [ "$ARTIFACTS_FOUND" = true ]; then
    print_status "All build artifacts verified"
else
    print_error "Some build artifacts are missing"
    exit 1
fi

print_status "All packages built successfully!"

echo ""
echo "📦 Build artifacts:"
echo "  ├── packages/shared-types/dist/"
echo "  ├── packages/shared-utils/dist/"
echo "  ├── packages/shared-config/dist/"
echo "  ├── apps/backend/dist/"
echo "  └── apps/frontend/dist/"

echo ""
print_info "Next steps:"
echo "  • Start backend:     pnpm start"
echo "  • Start frontend:    pnpm dev:frontend"
echo "  • Start both:        pnpm dev:all"
echo "  • Run tests:         pnpm test"
echo "  • Build Docker:      make build"

echo ""
print_info "Workspace commands available:"
echo "  • pnpm -r <command>           # Run command in all packages"
echo "  • pnpm --filter <pkg> <cmd>   # Run command in specific package"
echo "  • make help                   # Show all available make commands"