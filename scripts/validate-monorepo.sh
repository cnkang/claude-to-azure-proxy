#!/bin/bash

# Validate monorepo structure and configuration
# Ensures all workspace packages are properly configured

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

echo "🔍 Validating monorepo structure and configuration..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

VALIDATION_FAILED=false

# Validate workspace configuration
print_step "Validating workspace configuration..."

if [ -f "pnpm-workspace.yaml" ]; then
    print_status "pnpm-workspace.yaml exists"
else
    print_error "pnpm-workspace.yaml is missing"
    VALIDATION_FAILED=true
fi

if [ -f "package.json" ]; then
    if grep -q '"private": true' package.json; then
        print_status "Root package.json is properly configured as private"
    else
        print_error "Root package.json should be marked as private"
        VALIDATION_FAILED=true
    fi
else
    print_error "Root package.json is missing"
    VALIDATION_FAILED=true
fi

# Validate shared packages
print_step "Validating shared packages..."

SHARED_PACKAGES=("shared-types" "shared-utils" "shared-config")
for package in "${SHARED_PACKAGES[@]}"; do
    if [ -d "packages/$package" ]; then
        if [ -f "packages/$package/package.json" ]; then
            print_status "packages/$package is properly configured"
        else
            print_error "packages/$package/package.json is missing"
            VALIDATION_FAILED=true
        fi
    else
        print_warning "packages/$package directory not found"
    fi
done

# Validate applications
print_step "Validating applications..."

APPLICATIONS=("backend" "frontend")
for app in "${APPLICATIONS[@]}"; do
    if [ -d "apps/$app" ]; then
        if [ -f "apps/$app/package.json" ]; then
            print_status "apps/$app is properly configured"
        else
            print_error "apps/$app/package.json is missing"
            VALIDATION_FAILED=true
        fi
    else
        print_warning "apps/$app directory not found"
    fi
done

# Validate build scripts
print_step "Validating build scripts..."

BUILD_SCRIPTS=("build-all.sh" "build-shared.sh" "build-apps.sh")
for script in "${BUILD_SCRIPTS[@]}"; do
    if [ -f "scripts/build/$script" ]; then
        if [ -x "scripts/build/$script" ]; then
            print_status "scripts/build/$script is executable"
        else
            print_warning "scripts/build/$script is not executable"
            chmod +x "scripts/build/$script"
            print_status "Made scripts/build/$script executable"
        fi
    else
        print_error "scripts/build/$script is missing"
        VALIDATION_FAILED=true
    fi
done

# Validate CI/CD scripts
print_step "Validating CI/CD scripts..."

if [ -f "scripts/ci-cd/run-ci.sh" ]; then
    if [ -x "scripts/ci-cd/run-ci.sh" ]; then
        print_status "scripts/ci-cd/run-ci.sh is executable"
    else
        print_warning "scripts/ci-cd/run-ci.sh is not executable"
        chmod +x "scripts/ci-cd/run-ci.sh"
        print_status "Made scripts/ci-cd/run-ci.sh executable"
    fi
else
    print_error "scripts/ci-cd/run-ci.sh is missing"
    VALIDATION_FAILED=true
fi

# Validate GitHub Actions workflow
print_step "Validating GitHub Actions workflow..."

if [ -f ".github/workflows/ci-cd.yml" ]; then
    if grep -q "pnpm-workspace.yaml" .github/workflows/ci-cd.yml; then
        print_status "GitHub Actions workflow is configured for monorepo"
    else
        print_warning "GitHub Actions workflow may need monorepo updates"
    fi
else
    print_warning ".github/workflows/ci-cd.yml not found"
fi

# Validate Docker configuration
print_step "Validating Docker configuration..."

if [ -f "Dockerfile" ]; then
    print_status "Root Dockerfile exists"
else
    print_warning "Root Dockerfile not found"
fi

if [ -f "apps/backend/Dockerfile" ]; then
    print_status "Backend Dockerfile exists"
else
    print_warning "Backend Dockerfile not found"
fi

if [ -f "apps/frontend/Dockerfile" ]; then
    print_status "Frontend Dockerfile exists"
else
    print_warning "Frontend Dockerfile not found"
fi

# Validate development scripts
print_step "Validating development scripts..."

DEV_SCRIPTS=("setup-workspace.sh" "start-dev.sh")
for script in "${DEV_SCRIPTS[@]}"; do
    if [ -f "scripts/dev/$script" ]; then
        if [ -x "scripts/dev/$script" ]; then
            print_status "scripts/dev/$script is executable"
        else
            print_warning "scripts/dev/$script is not executable"
            chmod +x "scripts/dev/$script"
            print_status "Made scripts/dev/$script executable"
        fi
    else
        print_error "scripts/dev/$script is missing"
        VALIDATION_FAILED=true
    fi
done

# Test workspace commands
print_step "Testing workspace commands..."

if command -v pnpm &> /dev/null; then
    if pnpm list --depth=0 > /dev/null 2>&1; then
        print_status "Workspace dependencies are properly installed"
    else
        print_warning "Workspace dependencies may need to be installed"
        print_info "Run 'pnpm install' to install dependencies"
    fi
else
    print_error "pnpm is not installed"
    VALIDATION_FAILED=true
fi

# Final validation result
echo ""
if [ "$VALIDATION_FAILED" = true ]; then
    print_error "Monorepo validation failed!"
    echo ""
    print_info "To fix issues:"
    echo "  1. Ensure all required files are present"
    echo "  2. Run 'pnpm install' to install dependencies"
    echo "  3. Run this script again to re-validate"
    exit 1
else
    print_status "Monorepo validation passed!"
    echo ""
    print_info "Your monorepo is properly configured and ready for development"
    echo ""
    print_info "Next steps:"
    echo "  • Run 'pnpm dev:all' to start development servers"
    echo "  • Run 'pnpm test' to run all tests"
    echo "  • Run 'pnpm build' to build all packages"
    echo "  • Run 'make help' to see all available commands"
fi