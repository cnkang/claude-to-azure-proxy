#!/bin/bash

# Production Build Script for Claude-to-Azure Proxy
# This script builds optimized production images with security scanning

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT_HASH=${COMMIT_HASH:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}
VERSION=${VERSION:-"2.0.0"}
BUILD_TARGET=${BUILD_TARGET:-"production"}
CDN_URL=${CDN_URL:-""}
ENABLE_ANALYTICS=${ENABLE_ANALYTICS:-"true"}
ENABLE_ERROR_REPORTING=${ENABLE_ERROR_REPORTING:-"true"}

# Docker image names
BACKEND_IMAGE="claude-to-azure-proxy:backend-${VERSION}"
FRONTEND_IMAGE="claude-to-azure-proxy:frontend-${VERSION}"
BACKEND_IMAGE_LATEST="claude-to-azure-proxy:backend-latest"
FRONTEND_IMAGE_LATEST="claude-to-azure-proxy:frontend-latest"

echo -e "${BLUE}🏗️  Starting Production Build${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "Build Date: ${BUILD_DATE}"
echo -e "Commit Hash: ${COMMIT_HASH}"
echo -e "Version: ${VERSION}"
echo -e "Build Target: ${BUILD_TARGET}"
echo -e "CDN URL: ${CDN_URL:-"(not set)"}"
echo -e "Analytics: ${ENABLE_ANALYTICS}"
echo -e "Error Reporting: ${ENABLE_ERROR_REPORTING}"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Function to print step headers
print_step() {
    echo -e "\n${YELLOW}📋 $1${NC}"
    echo -e "${YELLOW}$(printf '=%.0s' {1..50})${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate prerequisites
print_step "Validating Prerequisites"

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command_exists pnpm; then
    echo -e "${RED}❌ pnpm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites satisfied${NC}"

# Clean previous builds
print_step "Cleaning Previous Builds"

# Remove existing images
docker rmi "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$BACKEND_IMAGE_LATEST" "$FRONTEND_IMAGE_LATEST" 2>/dev/null || true

# Clean workspace
pnpm run build:clean || true

echo -e "${GREEN}✅ Cleanup completed${NC}"

# Install dependencies
print_step "Installing Dependencies"

pnpm install --frozen-lockfile
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Build shared packages
print_step "Building Shared Packages"

pnpm run build:shared
echo -e "${GREEN}✅ Shared packages built${NC}"

# Security audit
print_step "Running Security Audit"

echo "Running dependency audit..."
pnpm audit --audit-level moderate || echo -e "${YELLOW}⚠️  Security audit completed with warnings${NC}"

echo "Checking for outdated packages..."
pnpm outdated || echo -e "${YELLOW}⚠️  Some packages are outdated${NC}"

echo -e "${GREEN}✅ Security audit completed${NC}"

# Build backend Docker image
print_step "Building Backend Docker Image"

docker build \
    --file apps/backend/Dockerfile \
    --tag "$BACKEND_IMAGE" \
    --tag "$BACKEND_IMAGE_LATEST" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --build-arg COMMIT_HASH="$COMMIT_HASH" \
    --build-arg VERSION="$VERSION" \
    --target runner \
    .

echo -e "${GREEN}✅ Backend image built: $BACKEND_IMAGE${NC}"

# Build frontend Docker image
print_step "Building Frontend Docker Image"

docker build \
    --file apps/frontend/Dockerfile \
    --tag "$FRONTEND_IMAGE" \
    --tag "$FRONTEND_IMAGE_LATEST" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --build-arg COMMIT_HASH="$COMMIT_HASH" \
    --build-arg VERSION="$VERSION" \
    --build-arg CDN_URL="$CDN_URL" \
    --build-arg BUILD_TARGET="$BUILD_TARGET" \
    --build-arg ENABLE_ANALYTICS="$ENABLE_ANALYTICS" \
    --build-arg ENABLE_ERROR_REPORTING="$ENABLE_ERROR_REPORTING" \
    --target runner \
    .

echo -e "${GREEN}✅ Frontend image built: $FRONTEND_IMAGE${NC}"

# Validate images
print_step "Validating Built Images"

echo "Inspecting backend image..."
docker image inspect "$BACKEND_IMAGE" > /dev/null
BACKEND_SIZE=$(docker images "$BACKEND_IMAGE" --format "{{.Size}}")

echo "Inspecting frontend image..."
docker image inspect "$FRONTEND_IMAGE" > /dev/null
FRONTEND_SIZE=$(docker images "$FRONTEND_IMAGE" --format "{{.Size}}")

echo -e "${GREEN}✅ Backend image size: $BACKEND_SIZE${NC}"
echo -e "${GREEN}✅ Frontend image size: $FRONTEND_SIZE${NC}"

# Security scanning
print_step "Running Security Scans"

if command_exists trivy; then
    echo "Scanning backend image with Trivy..."
    trivy image --severity HIGH,CRITICAL "$BACKEND_IMAGE" || echo -e "${YELLOW}⚠️  Backend security scan completed with findings${NC}"
    
    echo "Scanning frontend image with Trivy..."
    trivy image --severity HIGH,CRITICAL "$FRONTEND_IMAGE" || echo -e "${YELLOW}⚠️  Frontend security scan completed with findings${NC}"
else
    echo -e "${YELLOW}⚠️  Trivy not installed, skipping security scan${NC}"
fi

# Test images
print_step "Testing Built Images"

echo "Testing backend image..."
BACKEND_CONTAINER=$(docker run -d --rm -p 8080:8080 \
    -e PROXY_API_KEY=test-key \
    -e AZURE_OPENAI_ENDPOINT=https://test.openai.azure.com \
    -e AZURE_OPENAI_API_KEY=test-key \
    -e AZURE_OPENAI_MODEL=test-model \
    "$BACKEND_IMAGE")

# Wait for backend to start
sleep 10

# Test health endpoint
if curl -f http://localhost:8080/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend health check passed${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    docker logs "$BACKEND_CONTAINER"
    docker stop "$BACKEND_CONTAINER"
    exit 1
fi

docker stop "$BACKEND_CONTAINER"

echo "Testing frontend image..."
FRONTEND_CONTAINER=$(docker run -d --rm -p 3000:80 "$FRONTEND_IMAGE")

# Wait for frontend to start
sleep 5

# Test health endpoint
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend health check passed${NC}"
else
    echo -e "${RED}❌ Frontend health check failed${NC}"
    docker logs "$FRONTEND_CONTAINER"
    docker stop "$FRONTEND_CONTAINER"
    exit 1
fi

docker stop "$FRONTEND_CONTAINER"

# Generate build report
print_step "Generating Build Report"

BUILD_REPORT="build-report-${BUILD_DATE}.json"

cat > "$BUILD_REPORT" << EOF
{
  "buildDate": "$BUILD_DATE",
  "commitHash": "$COMMIT_HASH",
  "version": "$VERSION",
  "buildTarget": "$BUILD_TARGET",
  "cdnUrl": "$CDN_URL",
  "enableAnalytics": $ENABLE_ANALYTICS,
  "enableErrorReporting": $ENABLE_ERROR_REPORTING,
  "images": {
    "backend": {
      "name": "$BACKEND_IMAGE",
      "size": "$BACKEND_SIZE"
    },
    "frontend": {
      "name": "$FRONTEND_IMAGE",
      "size": "$FRONTEND_SIZE"
    }
  },
  "buildDuration": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "success"
}
EOF

echo -e "${GREEN}✅ Build report generated: $BUILD_REPORT${NC}"

# Summary
print_step "Build Summary"

echo -e "${GREEN}🎉 Production build completed successfully!${NC}"
echo ""
echo -e "${BLUE}Built Images:${NC}"
echo -e "  Backend:  $BACKEND_IMAGE ($BACKEND_SIZE)"
echo -e "  Frontend: $FRONTEND_IMAGE ($FRONTEND_SIZE)"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Test the images: docker-compose -f docker-compose.prod.yml up -d"
echo -e "  2. Push to registry: docker push $BACKEND_IMAGE && docker push $FRONTEND_IMAGE"
echo -e "  3. Deploy to production environment"
echo ""
echo -e "${BLUE}Build Report: $BUILD_REPORT${NC}"

exit 0