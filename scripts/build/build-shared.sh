#!/bin/bash

# Build shared packages in dependency order
# This script ensures shared packages are built before applications

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
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

print_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

echo "🏗️  Building shared packages..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Build shared packages in dependency order
SHARED_PACKAGES=("shared-config" "shared-types" "shared-utils")

for package in "${SHARED_PACKAGES[@]}"; do
    if [ -d "packages/$package" ]; then
        print_step "Building $package..."
        if pnpm --filter "@repo/$package" build; then
            print_status "$package built successfully"
        else
            print_error "Failed to build $package"
            exit 1
        fi
    else
        print_info "$package not found, skipping..."
    fi
done

print_status "All shared packages built successfully!"

echo ""
print_info "Shared packages are now ready for use by applications"