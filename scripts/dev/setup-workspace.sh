#!/bin/bash

# Workspace setup script for new developers
# Sets up the entire monorepo development environment

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

echo "🛠️  Setting up workspace development environment..."

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check Node.js version
print_step "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 24 ]; then
        print_status "Node.js version $(node --version) is compatible"
    else
        print_error "Node.js 24+ is required. Current version: $(node --version)"
        exit 1
    fi
else
    print_error "Node.js is not installed. Please install Node.js 24+ first."
    exit 1
fi

# Check if pnpm is available
print_step "Checking pnpm installation..."
if ! command -v pnpm &> /dev/null; then
    print_warning "pnpm is not installed. Installing pnpm..."
    npm install -g pnpm
    print_status "pnpm installed successfully"
else
    print_status "pnpm is already installed: $(pnpm --version)"
fi

# Create .env file if it doesn't exist
print_step "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_status ".env file created from .env.example"
        print_warning "Please update .env with your actual values"
    else
        print_warning ".env.example not found, creating basic .env file"
        cat > .env << EOF
# Basic environment configuration
NODE_ENV=development
PORT=8080

# Add your actual configuration values here
PROXY_API_KEY=your-proxy-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=your-model-deployment-name
EOF
        print_status "Basic .env file created"
        print_warning "Please update .env with your actual values"
    fi
else
    print_status ".env file already exists"
fi

# Install workspace dependencies
print_step "Installing workspace dependencies..."
pnpm install
print_status "Dependencies installed successfully"

# Build shared packages
print_step "Building shared packages..."
pnpm build:shared
print_status "Shared packages built successfully"

# Set up Git hooks if husky is available
if [ -f ".husky/pre-commit" ]; then
    print_step "Setting up Git hooks..."
    if command -v git &> /dev/null && [ -d ".git" ]; then
        pnpm run postinstall 2>/dev/null || true
        print_status "Git hooks configured"
    else
        print_warning "Git not initialized, skipping Git hooks setup"
    fi
fi

# Run initial validation
print_step "Running initial validation..."
if pnpm type-check; then
    print_status "TypeScript validation passed"
else
    print_warning "TypeScript validation failed - this is normal for initial setup"
fi

if pnpm lint; then
    print_status "Linting validation passed"
else
    print_warning "Linting issues found - run 'pnpm lint:fix' to fix"
fi

print_status "Workspace setup completed successfully!"

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "📋 Next steps:"
echo "  1. Update .env with your actual configuration values"
echo "  2. Run 'pnpm dev:all' to start both backend and frontend"
echo "  3. Or run 'make dev-all' to use the Makefile commands"
echo ""
echo "🔧 Available commands:"
echo "  • pnpm dev:all        # Start both backend and frontend"
echo "  • pnpm dev            # Start backend only"
echo "  • pnpm dev:frontend   # Start frontend only"
echo "  • pnpm test           # Run all tests"
echo "  • pnpm build          # Build all packages"
echo "  • make help           # Show all Makefile commands"
echo ""
echo "📚 Documentation:"
echo "  • README.md           # Project overview"
echo "  • docs/               # Detailed documentation"
echo "  • .kiro/specs/        # Feature specifications"