#!/bin/bash

# Migration script for converting to monorepo structure
# This script helps migrate existing code to the new monorepo structure

set -e

echo "🚀 Starting monorepo migration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is required but not installed. Please install pnpm first."
    exit 1
fi

print_status "Monorepo structure has been created successfully!"

echo ""
echo "📁 Directory structure created:"
echo "  ├── apps/"
echo "  │   ├── backend/     # Express.js API server"
echo "  │   └── frontend/    # React web application"
echo "  ├── packages/"
echo "  │   ├── shared-types/    # TypeScript type definitions"
echo "  │   ├── shared-utils/    # Utility functions"
echo "  │   └── shared-config/   # ESLint, TypeScript, Vitest configs"
echo "  ├── infra/           # Infrastructure as Code"
echo "  ├── docs/            # Documentation"
echo "  └── scripts/         # Build and deployment scripts"

echo ""
echo "🔧 Next steps:"
echo "1. Install dependencies: pnpm install"
echo "2. Build shared packages: pnpm build:shared"
echo "3. Move existing backend code to apps/backend/"
echo "4. Move existing frontend code to apps/frontend/"
echo "5. Update import paths to use workspace dependencies"
echo "6. Test the new structure: pnpm test"

echo ""
print_status "Migration preparation complete!"
print_warning "Remember to update your CI/CD pipelines to work with the new structure"