#!/bin/bash

# Frontend Production Build Script
# This script builds the frontend with production optimizations and security scanning

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/apps/frontend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get build metadata
get_build_metadata() {
    export BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    export COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    export VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
    
    log_info "Build metadata:"
    log_info "  Version: $VERSION"
    log_info "  Commit: $COMMIT_HASH"
    log_info "  Build Date: $BUILD_DATE"
}

# Pre-build security checks
security_checks() {
    log_info "Running security checks..."
    
    cd "$FRONTEND_DIR"
    
    # Audit dependencies
    log_info "Auditing dependencies..."
    if ! pnpm audit --audit-level moderate; then
        log_warning "Security audit found issues, but continuing build"
    fi
    
    # Check for known vulnerabilities
    log_info "Checking for known vulnerabilities..."
    if command -v audit-ci &> /dev/null; then
        audit-ci --moderate || log_warning "Vulnerability check found issues"
    fi
    
    # License compliance check
    log_info "Checking license compliance..."
    if command -v license-checker &> /dev/null; then
        license-checker --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD' --summary || log_warning "License check found issues"
    fi
    
    log_success "Security checks completed"
}

# Build optimization checks
build_optimization_checks() {
    log_info "Running build optimization checks..."
    
    cd "$FRONTEND_DIR"
    
    # Type checking
    log_info "Running type checks..."
    if ! pnpm run type-check; then
        log_error "Type checking failed"
        exit 1
    fi
    
    # Linting
    log_info "Running linting..."
    if ! pnpm run lint; then
        log_error "Linting failed"
        exit 1
    fi
    
    # Tests
    log_info "Running tests..."
    if ! pnpm run test; then
        log_error "Tests failed"
        exit 1
    fi
    
    log_success "Build optimization checks passed"
}

# Build the frontend
build_frontend() {
    log_info "Building frontend for production..."
    
    cd "$FRONTEND_DIR"
    
    # Clean previous build
    rm -rf dist/
    
    # Set production environment variables
    export NODE_ENV=production
    export VITE_BUILD_ANALYZE=false
    export VITE_SOURCE_MAPS=false
    export VITE_CDN_URL="${CDN_URL:-}"
    
    # Build with production optimizations
    if ! pnpm run build:prod; then
        log_error "Frontend build failed"
        exit 1
    fi
    
    # Verify build output
    if [[ ! -f "dist/index.html" ]]; then
        log_error "Build verification failed: index.html not found"
        exit 1
    fi
    
    log_success "Frontend build completed"
}

# Analyze build output
analyze_build() {
    log_info "Analyzing build output..."
    
    cd "$FRONTEND_DIR"
    
    # Check bundle sizes
    log_info "Bundle size analysis:"
    
    # JavaScript bundles
    js_files=$(find dist/assets -name "*.js" -type f 2>/dev/null || true)
    if [[ -n "$js_files" ]]; then
        echo "$js_files" | while read -r file; do
            size=$(du -h "$file" | cut -f1)
            filename=$(basename "$file")
            echo "  JS: $filename - $size"
            
            # Warn about large bundles
            size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            if [[ $size_bytes -gt 512000 ]]; then # 500KB
                log_warning "Large JS bundle detected: $filename ($size)"
            fi
        done
    fi
    
    # CSS bundles
    css_files=$(find dist/assets -name "*.css" -type f 2>/dev/null || true)
    if [[ -n "$css_files" ]]; then
        echo "$css_files" | while read -r file; do
            size=$(du -h "$file" | cut -f1)
            filename=$(basename "$file")
            echo "  CSS: $filename - $size"
            
            # Warn about large CSS files
            size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            if [[ $size_bytes -gt 102400 ]]; then # 100KB
                log_warning "Large CSS bundle detected: $filename ($size)"
            fi
        done
    fi
    
    # Total build size
    total_size=$(du -sh dist/ | cut -f1)
    log_info "Total build size: $total_size"
    
    # Generate build manifest
    cat > dist/build-info.json << EOF
{
  "buildDate": "$BUILD_DATE",
  "commitHash": "$COMMIT_HASH",
  "version": "$VERSION",
  "environment": "production",
  "buildSize": "$total_size",
  "nodeVersion": "$(node --version)",
  "pnpmVersion": "$(pnpm --version)"
}
EOF
    
    log_success "Build analysis completed"
}

# Generate SBOM (Software Bill of Materials)
generate_sbom() {
    log_info "Generating Software Bill of Materials (SBOM)..."
    
    cd "$FRONTEND_DIR"
    
    if command -v cyclonedx-npm &> /dev/null; then
        cyclonedx-npm --output-file dist/sbom.json || log_warning "SBOM generation failed"
        log_success "SBOM generated: dist/sbom.json"
    else
        log_warning "cyclonedx-npm not found, skipping SBOM generation"
    fi
}

# Performance budget check
performance_budget_check() {
    log_info "Checking performance budget..."
    
    cd "$FRONTEND_DIR"
    
    # Check JavaScript budget (500KB)
    js_total=0
    js_files=$(find dist/assets -name "*.js" -type f 2>/dev/null || true)
    if [[ -n "$js_files" ]]; then
        while read -r file; do
            size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            js_total=$((js_total + size_bytes))
        done <<< "$js_files"
    fi
    
    js_total_kb=$((js_total / 1024))
    log_info "Total JavaScript size: ${js_total_kb}KB"
    
    if [[ $js_total_kb -gt 500 ]]; then
        log_warning "JavaScript bundle exceeds performance budget (500KB): ${js_total_kb}KB"
    fi
    
    # Check CSS budget (100KB)
    css_total=0
    css_files=$(find dist/assets -name "*.css" -type f 2>/dev/null || true)
    if [[ -n "$css_files" ]]; then
        while read -r file; do
            size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            css_total=$((css_total + size_bytes))
        done <<< "$css_files"
    fi
    
    css_total_kb=$((css_total / 1024))
    log_info "Total CSS size: ${css_total_kb}KB"
    
    if [[ $css_total_kb -gt 100 ]]; then
        log_warning "CSS bundle exceeds performance budget (100KB): ${css_total_kb}KB"
    fi
    
    log_success "Performance budget check completed"
}

# Main build function
main() {
    local skip_checks="${1:-false}"
    
    log_info "Starting frontend production build..."
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Get build metadata
    get_build_metadata
    
    # Run checks unless skipped
    if [[ "$skip_checks" != "true" ]]; then
        security_checks
        build_optimization_checks
    fi
    
    # Build frontend
    build_frontend
    
    # Analyze build
    analyze_build
    
    # Generate SBOM
    generate_sbom
    
    # Check performance budget
    performance_budget_check
    
    log_success "Frontend production build completed successfully!"
    log_info "Build output: $FRONTEND_DIR/dist/"
}

# Show usage information
usage() {
    echo "Usage: $0 [--skip-checks]"
    echo ""
    echo "Options:"
    echo "  --skip-checks    Skip security and optimization checks"
    echo ""
    echo "Environment variables:"
    echo "  CDN_URL         CDN URL for assets (optional)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full build with all checks"
    echo "  $0 --skip-checks     # Build without pre-checks"
    echo "  CDN_URL=https://cdn.example.com $0  # Build with CDN"
}

# Handle command line arguments
case "${1:-}" in
    "--help"|"-h")
        usage
        exit 0
        ;;
    "--skip-checks")
        main true
        ;;
    "")
        main false
        ;;
    *)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
esac