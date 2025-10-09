#!/bin/bash

# Pre-commit Hooks Setup Script
# This script sets up and configures pre-commit hooks for the project

set -e

echo "🚀 Setting up pre-commit hooks for Claude-to-Azure Proxy..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install pnpm first:"
    echo "  npm install -g pnpm"
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
pnpm install

# Initialize husky
print_status "Initializing Husky..."
pnpm run prepare

# Make hooks executable
print_status "Setting up hook permissions..."
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
chmod +x .husky/prepare-commit-msg
chmod +x .husky/pre-push

# Test the setup
print_status "Testing pre-commit hooks setup..."

# Test type checking
print_status "Testing TypeScript compilation..."
if pnpm run type-check; then
    print_success "TypeScript compilation test passed"
else
    print_error "TypeScript compilation test failed"
    exit 1
fi

# Test linting
print_status "Testing ESLint configuration..."
if pnpm run lint; then
    print_success "ESLint test passed"
else
    print_error "ESLint test failed"
    exit 1
fi

# Test formatting
print_status "Testing Prettier configuration..."
if pnpm run format:check; then
    print_success "Prettier test passed"
else
    print_warning "Some files need formatting. Run 'pnpm run format' to fix."
fi

# Test build
print_status "Testing build process..."
if pnpm run build; then
    print_success "Build test passed"
    # Clean up build artifacts
    rm -rf dist/
else
    print_error "Build test failed"
    exit 1
fi

# Display hook information
echo ""
echo "🎉 Pre-commit hooks setup completed successfully!"
echo ""
echo "📋 Configured hooks:"
echo "  • pre-commit: Type check, lint, test, security audit"
echo "  • commit-msg: Conventional commits validation"
echo "  • prepare-commit-msg: Automatic ticket number integration"
echo "  • pre-push: Comprehensive testing and build verification"
echo ""
echo "🔧 Available commands:"
echo "  pnpm run pre-commit:check  - Run all pre-commit checks manually"
echo "  pnpm run pre-commit:fix    - Auto-fix common issues"
echo "  pnpm run validate          - Comprehensive validation"
echo ""
echo "📚 Documentation:"
echo "  docs/PRE_COMMIT_HOOKS.md   - Detailed hook documentation"
echo ""
echo "✨ Next steps:"
echo "  1. Make a test commit to verify hooks are working"
echo "  2. Review docs/PRE_COMMIT_HOOKS.md for detailed information"
echo "  3. Share this setup with your team members"
echo ""
print_success "Setup complete! Your commits will now be automatically validated."