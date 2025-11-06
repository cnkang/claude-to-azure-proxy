#!/bin/bash

# CDN Deployment Script for Frontend Assets
# This script deploys frontend assets to a CDN and updates the application configuration

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

# Check required environment variables
check_environment() {
    log_info "Checking CDN deployment environment..."
    
    local required_vars=()
    
    case "${CDN_PROVIDER:-}" in
        "aws")
            required_vars=("AWS_S3_BUCKET" "AWS_CLOUDFRONT_DISTRIBUTION_ID")
            ;;
        "azure")
            required_vars=("AZURE_STORAGE_ACCOUNT" "AZURE_CDN_PROFILE" "AZURE_CDN_ENDPOINT")
            ;;
        "gcp")
            required_vars=("GCP_BUCKET" "GCP_CDN_URL")
            ;;
        "custom")
            required_vars=("CDN_UPLOAD_URL" "CDN_API_KEY")
            ;;
        *)
            log_error "CDN_PROVIDER must be set to: aws, azure, gcp, or custom"
            exit 1
            ;;
    esac
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables for CDN provider '$CDN_PROVIDER':"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        exit 1
    fi
    
    log_success "CDN environment check passed"
}

# Build frontend with CDN configuration
build_for_cdn() {
    log_info "Building frontend for CDN deployment..."
    
    cd "$PROJECT_ROOT"
    
    # Set CDN-specific environment variables
    export CDN_URL="${CDN_BASE_URL:-}"
    export VITE_CDN_URL="$CDN_URL"
    export VITE_ASSETS_BASE_URL="$CDN_URL"
    
    # Build frontend with CDN configuration
    if ! "$SCRIPT_DIR/build-frontend-prod.sh"; then
        log_error "Frontend build for CDN failed"
        exit 1
    fi
    
    log_success "Frontend built for CDN deployment"
}

# Deploy to AWS S3 + CloudFront
deploy_aws_cdn() {
    log_info "Deploying to AWS S3 + CloudFront..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Sync assets to S3
    log_info "Syncing assets to S3 bucket: $AWS_S3_BUCKET"
    aws s3 sync "$FRONTEND_DIR/dist/" "s3://$AWS_S3_BUCKET/" \
        --delete \
        --cache-control "public, max-age=31536000" \
        --exclude "*.html" \
        --exclude "build-info.json" \
        --exclude "sbom.json"
    
    # Upload HTML 