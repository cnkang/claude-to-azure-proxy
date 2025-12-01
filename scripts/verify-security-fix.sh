#!/bin/bash
# Security Fix Verification Script
# Verifies that CVE-2024-58251 (ssl_client) has been fixed in Docker images

set -e

echo "🔒 Security Fix Verification Script"
echo "===================================="
echo ""
echo "Verifying fix for CVE-2024-58251 (ssl_client vulnerability)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check ssl_client version in an image
check_ssl_client_version() {
    local image_name=$1
    local image_tag=$2
    local full_image="${image_name}:${image_tag}"
    
    echo "📦 Checking ${full_image}..."
    
    # Check if image exists
    if ! docker image inspect "${full_image}" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Image ${full_image} not found. Building...${NC}"
        return 1
    fi
    
    # Get ssl_client version
    local version=$(docker run --rm "${full_image}" sh -c "apk info ssl_client 2>/dev/null | grep -oP 'ssl_client-\K[0-9]+\.[0-9]+\.[0-9]+-r[0-9]+' || echo 'not-found'")
    
    if [ "$version" = "not-found" ]; then
        echo -e "${RED}❌ ssl_client not found in image${NC}"
        return 1
    fi
    
    # Extract version number (e.g., 1.37.0-r20)
    local version_number=$(echo "$version" | grep -oP 'r\K[0-9]+')
    
    echo "   Version: ssl_client-${version}"
    
    # Check if version is >= r20 (fixed version)
    if [ "$version_number" -ge 20 ]; then
        echo -e "${GREEN}✅ FIXED - Version is ${version} (>= 1.37.0-r20)${NC}"
        return 0
    else
        echo -e "${RED}❌ VULNERABLE - Version is ${version} (< 1.37.0-r20)${NC}"
        return 1
    fi
}

# Function to build and check an image
build_and_check() {
    local dockerfile=$1
    local image_name=$2
    local context=$3
    
    echo ""
    echo "🔨 Building ${image_name}..."
    
    if docker build -f "${dockerfile}" -t "${image_name}:test" "${context}" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Build successful${NC}"
        check_ssl_client_version "${image_name}" "test"
        return $?
    else
        echo -e "${RED}❌ Build failed${NC}"
        return 1
    fi
}

# Main verification
echo "Starting verification..."
echo ""

# Track results
all_passed=true

# Check root Dockerfile (combined frontend/backend)
if build_and_check "Dockerfile" "claude-to-azure-proxy" "."; then
    echo -e "${GREEN}✅ Root Dockerfile: PASSED${NC}"
else
    echo -e "${RED}❌ Root Dockerfile: FAILED${NC}"
    all_passed=false
fi

echo ""

# Check backend Dockerfile
if build_and_check "apps/backend/Dockerfile" "claude-to-azure-proxy-backend" "."; then
    echo -e "${GREEN}✅ Backend Dockerfile: PASSED${NC}"
else
    echo -e "${RED}❌ Backend Dockerfile: FAILED${NC}"
    all_passed=false
fi

echo ""

# Check frontend Dockerfile
if build_and_check "apps/frontend/Dockerfile" "claude-to-azure-proxy-frontend" "."; then
    echo -e "${GREEN}✅ Frontend Dockerfile: PASSED${NC}"
else
    echo -e "${RED}❌ Frontend Dockerfile: FAILED${NC}"
    all_passed=false
fi

echo ""
echo "===================================="

# Final result
if [ "$all_passed" = true ]; then
    echo -e "${GREEN}✅ All security checks PASSED${NC}"
    echo ""
    echo "CVE-2024-58251 has been successfully fixed in all Docker images."
    echo ""
    echo "Next steps:"
    echo "1. Tag images for deployment:"
    echo "   docker tag claude-to-azure-proxy:test claude-to-azure-proxy:latest"
    echo "2. Push to registry:"
    echo "   docker push claude-to-azure-proxy:latest"
    echo "3. Deploy to production"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some security checks FAILED${NC}"
    echo ""
    echo "Please review the errors above and rebuild the affected images."
    echo ""
    exit 1
fi
