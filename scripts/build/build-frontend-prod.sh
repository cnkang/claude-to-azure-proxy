#!/bin/bash

# Production Frontend Build Script
# This script builds the frontend with production optimizations and security scanning

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUILD_DIR="apps/frontend/dist"
SECURITY_REPORT_DIR="security-reports"
BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_VERSION=${BUILD_VERSION:-"2.0.0"}

echo -e "${BLUE}🚀 Starting Production Frontend Build${NC}"
echo -e "${BLUE}Timestamp: ${BUILD_TIMESTAMP}${NC}"
echo -e "${BLUE}Version: ${BUILD_VERSION}${NC}"

# Function to print step headers
print_step() {
    echo -e "\n${BLUE}==== $1 ====${NC}"
}

# Function to check command success
check_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1 completed successfully${NC}"
    else
        echo -e "${RED}❌ $1 failed${NC}"
        exit 1
    fi
}

# Create security reports directory
mkdir -p "${SECURITY_REPORT_DIR}"

print_step "1. Environment Setup"
# Ensure we're in the project root
if [ ! -f "package.json" ] || [ ! -d "apps/frontend" ]; then
    echo -e "${RED}❌ Must be run from project root${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
echo -e "${GREEN}Node.js version: ${NODE_VERSION}${NC}"

# Check pnpm version
PNPM_VERSION=$(pnpm --version)
echo -e "${GREEN}pnpm version: ${PNPM_VERSION}${NC}"

print_step "2. Security Audit"
echo -e "${YELLOW}Running security audit...${NC}"
pnpm audit --audit-level moderate > "${SECURITY_REPORT_DIR}/audit-report.txt" 2>&1 || {
    echo -e "${YELLOW}⚠️ Security audit found issues. Check ${SECURITY_REPORT_DIR}/audit-report.txt${NC}"
}

# Generate SBOM (Software Bill of Materials)
echo -e "${YELLOW}Generating Software Bill of Materials...${NC}"
cd apps/frontend
pnpm dlx @cyclonedx/cyclonedx-npm --output-file "../../${SECURITY_REPORT_DIR}/frontend-sbom.json" || {
    echo -e "${YELLOW}⚠️ SBOM generation failed${NC}"
}
cd ../..

check_success "Security audit and SBOM generation"

print_step "3. Clean Previous Build"
echo -e "${YELLOW}Cleaning previous build...${NC}"
rm -rf "${BUILD_DIR}"
check_success "Build cleanup"

print_step "4. Install Dependencies"
echo -e "${YELLOW}Installing dependencies...${NC}"
pnpm install --frozen-lockfile
check_success "Dependency installation"

print_step "5. Type Checking"
echo -e "${YELLOW}Running TypeScript type checking...${NC}"
pnpm --filter @repo/frontend run type-check
check_success "Type checking"

print_step "6. Linting"
echo -e "${YELLOW}Running ESLint...${NC}"
pnpm --filter @repo/frontend run lint
check_success "Linting"

print_step "7. Build Shared Packages"
echo -e "${YELLOW}Building shared packages...${NC}"
pnpm --filter @repo/shared-types build
pnpm --filter @repo/shared-utils build
pnpm --filter @repo/shared-config build
check_success "Shared packages build"

print_step "8. Production Build"
echo -e "${YELLOW}Building frontend for production...${NC}"

# Set production environment variables
export NODE_ENV=production
export VITE_BUILD_TIMESTAMP="${BUILD_TIMESTAMP}"
export VITE_BUILD_VERSION="${BUILD_VERSION}"

# Run production build
pnpm --filter @repo/frontend run build:prod
check_success "Production build"

print_step "9. Build Verification"
echo -e "${YELLOW}Verifying build output...${NC}"

# Check if essential files exist
REQUIRED_FILES=(
    "${BUILD_DIR}/index.html"
    "${BUILD_DIR}/assets"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -e "$file" ]; then
        echo -e "${RED}❌ Required file/directory missing: $file${NC}"
        exit 1
    fi
done

# Check build size
BUILD_SIZE=$(du -sh "${BUILD_DIR}" | cut -f1)
echo -e "${GREEN}📦 Build size: ${BUILD_SIZE}${NC}"

# Count assets
JS_FILES=$(find "${BUILD_DIR}" -name "*.js" | wc -l)
CSS_FILES=$(find "${BUILD_DIR}" -name "*.css" | wc -l)
IMAGE_FILES=$(find "${BUILD_DIR}" -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" -o -name "*.webp" | wc -l)

echo -e "${GREEN}📊 Asset summary:${NC}"
echo -e "  JavaScript files: ${JS_FILES}"
echo -e "  CSS files: ${CSS_FILES}"
echo -e "  Image files: ${IMAGE_FILES}"

check_success "Build verification"

print_step "10. Security Scanning"
echo -e "${YELLOW}Scanning build output for security issues...${NC}"

# Check for potential security issues in build output
SECURITY_ISSUES=0

# Check for exposed secrets or API keys
if grep -r -i "api[_-]key\|secret\|password\|token" "${BUILD_DIR}" --exclude-dir=node_modules 2>/dev/null; then
    echo -e "${RED}⚠️ Potential secrets found in build output${NC}"
    SECURITY_ISSUES=$((SECURITY_ISSUES + 1))
fi

# Check for debug code
if grep -r "console\.log\|debugger\|TODO\|FIXME" "${BUILD_DIR}" --include="*.js" 2>/dev/null; then
    echo -e "${YELLOW}⚠️ Debug code found in build output${NC}"
fi

# Check for source maps in production (should be disabled)
if find "${BUILD_DIR}" -name "*.map" | grep -q .; then
    echo -e "${YELLOW}⚠️ Source maps found in production build${NC}"
fi

if [ ${SECURITY_ISSUES} -eq 0 ]; then
    echo -e "${GREEN}✅ No critical security issues found${NC}"
else
    echo -e "${RED}❌ ${SECURITY_ISSUES} security issues found${NC}"
    exit 1
fi

print_step "11. Performance Analysis"
echo -e "${YELLOW}Analyzing build performance...${NC}"

# Analyze bundle sizes
echo -e "${GREEN}📈 Largest files:${NC}"
find "${BUILD_DIR}" -type f -exec ls -lh {} \; | sort -k5 -hr | head -10 | awk '{print "  " $9 " - " $5}'

# Check for large files that might impact performance
LARGE_FILES=$(find "${BUILD_DIR}" -type f -size +1M)
if [ -n "$LARGE_FILES" ]; then
    echo -e "${YELLOW}⚠️ Large files detected (>1MB):${NC}"
    echo "$LARGE_FILES" | while read -r file; do
        size=$(ls -lh "$file" | awk '{print $5}')
        echo -e "  ${file} - ${size}"
    done
fi

print_step "12. Generate Build Report"
echo -e "${YELLOW}Generating build report...${NC}"

BUILD_REPORT="${SECURITY_REPORT_DIR}/build-report.json"
cat > "${BUILD_REPORT}" << EOF
{
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "buildVersion": "${BUILD_VERSION}",
  "nodeVersion": "${NODE_VERSION}",
  "pnpmVersion": "${PNPM_VERSION}",
  "buildSize": "${BUILD_SIZE}",
  "assetCounts": {
    "javascript": ${JS_FILES},
    "css": ${CSS_FILES},
    "images": ${IMAGE_FILES}
  },
  "securityIssues": ${SECURITY_ISSUES},
  "buildPath": "${BUILD_DIR}",
  "environment": "production"
}
EOF

echo -e "${GREEN}📋 Build report saved to: ${BUILD_REPORT}${NC}"

print_step "13. CDN Preparation"
echo -e "${YELLOW}Preparing assets for CDN deployment...${NC}"

# Create CDN-ready directory structure
CDN_DIR="${BUILD_DIR}-cdn"
mkdir -p "${CDN_DIR}"

# Copy static assets with CDN-friendly structure
cp -r "${BUILD_DIR}/assets" "${CDN_DIR}/"
cp "${BUILD_DIR}/index.html" "${CDN_DIR}/"

# Generate asset manifest for CDN
ASSET_MANIFEST="${CDN_DIR}/asset-manifest.json"
echo -e "${YELLOW}Generating asset manifest...${NC}"

cat > "${ASSET_MANIFEST}" << EOF
{
  "version": "${BUILD_VERSION}",
  "timestamp": "${BUILD_TIMESTAMP}",
  "assets": {
EOF

# Add JavaScript files to manifest
find "${CDN_DIR}/assets" -name "*.js" | while read -r file; do
    filename=$(basename "$file")
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    echo "    \"${filename}\": {\"size\": ${size}, \"type\": \"javascript\"}," >> "${ASSET_MANIFEST}"
done

# Add CSS files to manifest
find "${CDN_DIR}/assets" -name "*.css" | while read -r file; do
    filename=$(basename "$file")
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    echo "    \"${filename}\": {\"size\": ${size}, \"type\": \"stylesheet\"}," >> "${ASSET_MANIFEST}"
done

# Close manifest JSON (remove trailing comma and close)
sed -i '$ s/,$//' "${ASSET_MANIFEST}" 2>/dev/null || sed -i '$ s/,$//' "${ASSET_MANIFEST}"
echo "  }" >> "${ASSET_MANIFEST}"
echo "}" >> "${ASSET_MANIFEST}"

echo -e "${GREEN}📦 CDN assets prepared in: ${CDN_DIR}${NC}"

print_step "Build Complete"
echo -e "${GREEN}🎉 Production build completed successfully!${NC}"
echo -e "${GREEN}📁 Build output: ${BUILD_DIR}${NC}"
echo -e "${GREEN}📁 CDN assets: ${CDN_DIR}${NC}"
echo -e "${GREEN}📋 Reports: ${SECURITY_REPORT_DIR}${NC}"
echo -e "${GREEN}⏱️  Build time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")${NC}"

# Final summary
echo -e "\n${BLUE}📊 Build Summary:${NC}"
echo -e "  Version: ${BUILD_VERSION}"
echo -e "  Size: ${BUILD_SIZE}"
echo -e "  Assets: ${JS_FILES} JS, ${CSS_FILES} CSS, ${IMAGE_FILES} images"
echo -e "  Security Issues: ${SECURITY_ISSUES}"
echo -e "  Status: ${GREEN}✅ Ready for deployment${NC}"