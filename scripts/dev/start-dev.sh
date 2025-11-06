#!/bin/bash

# Development startup script for the monorepo
# Starts both backend and frontend in development mode with workspace awareness

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

echo "🚀 Starting development environment..."

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

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_step "Installing workspace dependencies..."
    pnpm install
    print_status "Dependencies installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_warning ".env file not found. Creating from .env.example..."
        cp .env.example .env
        print_info "Please update .env with your actual values before continuing"
        print_info "Press Enter to continue after updating .env, or Ctrl+C to exit"
        read -r
    else
        print_error ".env file not found and no .env.example available"
        exit 1
    fi
fi

# Build shared packages first
print_step "Building shared packages..."
if pnpm build:shared; then
    print_status "Shared packages built successfully"
else
    print_error "Failed to build shared packages"
    exit 1
fi

# Check which applications exist
BACKEND_EXISTS=false
FRONTEND_EXISTS=false

if [ -d "apps/backend" ]; then
    BACKEND_EXISTS=true
fi

if [ -d "apps/frontend" ]; then
    FRONTEND_EXISTS=true
fi

print_status "Starting development servers..."

if [ "$BACKEND_EXISTS" = true ]; then
    print_info "Backend will be available at: http://localhost:8080"
fi

if [ "$FRONTEND_EXISTS" = true ]; then
    print_info "Frontend will be available at: http://localhost:3000"
fi

echo ""
print_info "Development server logs will appear below..."
print_info "Press Ctrl+C to stop all servers"
echo ""

# Start development servers based on what's available
if [ "$BACKEND_EXISTS" = true ] && [ "$FRONTEND_EXISTS" = true ]; then
    # Start both backend and frontend
    pnpm dev:all
elif [ "$BACKEND_EXISTS" = true ]; then
    # Start only backend
    print_warning "Frontend not found, starting backend only..."
    pnpm dev
elif [ "$FRONTEND_EXISTS" = true ]; then
    # Start only frontend
    print_warning "Backend not found, starting frontend only..."
    pnpm dev:frontend
else
    print_error "No applications found to start"
    exit 1
fi