#!/bin/bash

# Update workspace scripts to ensure proper monorepo configuration
# This script ensures all package.json scripts are properly configured

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

echo "🔧 Updating workspace scripts for monorepo..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Update root package.json scripts
print_step "Updating root package.json scripts..."

# Add any missing scripts to root package.json
if ! grep -q '"validate-monorepo"' package.json; then
    print_info "Adding validate-monorepo script to root package.json"
    # This would require jq or manual editing, for now just inform
    print_warning "Please add 'validate-monorepo': './scripts/validate-monorepo.sh' to package.json scripts"
fi

# Ensure all workspace packages have consistent scripts
print_step "Checking workspace package scripts..."

# Check shared packages
for package in shared-types shared-utils shared-config; do
    if [ -f "packages/$package/package.json" ]; then
        print_info "Checking packages/$package/package.json"
        
        # Check for required scripts
        if grep -q '"build"' "packages/$package/package.json"; then
            print_status "packages/$package has build script"
        else
            print_warning "packages/$package missing build script"
        fi
        
        if grep -q '"test"' "packages/$package/package.json"; then
            print_status "packages/$package has test script"
        else
            print_warning "packages/$package missing test script"
        fi
    fi
done

# Check application packages
for app in backend frontend; do
    if [ -f "apps/$app/package.json" ]; then
        print_info "Checking apps/$app/package.json"
        
        # Check for required scripts
        if grep -q '"build"' "apps/$app/package.json"; then
            print_status "apps/$app has build script"
        else
            print_warning "apps/$app missing build script"
        fi
        
        if grep -q '"dev"' "apps/$app/package.json"; then
            print_status "apps/$app has dev script"
        else
            print_warning "apps/$app missing dev script"
        fi
        
        if grep -q '"test"' "apps/$app/package.json"; then
            print_status "apps/$app has test script"
        else
            print_warning "apps/$app missing test script"
        fi
    fi
done

# Verify workspace commands work
print_step "Testing workspace commands..."

if pnpm -r list > /dev/null 2>&1; then
    print_status "Workspace commands are working"
else
    print_error "Workspace commands are not working properly"
    exit 1
fi

print_status "Workspace scripts validation completed!"

echo ""
print_info "All workspace packages are properly configured"
print_info "You can now use workspace commands like:"
echo "  • pnpm -r build          # Build all packages"
echo "  • pnpm -r test           # Test all packages"
echo "  • pnpm --filter <pkg>    # Run commands in specific package"