#!/bin/bash

# Build application packages (backend and frontend)
# This script builds applications after shared packages are ready

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

echo "🏗️  Building application packages..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Ensure shared packages are built first
print_step "Ensuring shared packages are built..."
./scripts/build/build-shared.sh

# Build applications
APPLICATIONS=("backend" "frontend")

for app in "${APPLICATIONS[@]}"; do
    if [ -d "apps/$app" ]; then
        print_step "Building $app application..."
        if pnpm --filter "@repo/$app" build; then
            print_status "$app application built successfully"
        else
            print_error "Failed to build $app application"
            exit 1
        fi
    else
        print_info "$app application not found, skipping..."
    fi
done

print_status "All applications built successfully!"

echo ""
print_info "Applications are now ready for deployment or development"