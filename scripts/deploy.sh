#!/bin/bash

# Claude-to-Azure Proxy Deployment Script
# This script handles deployment with proper health checks and rollback procedures

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_TIMEOUT=300  # 5 minutes
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10

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

# Check if required environment variables are set
check_environment() {
    log_info "Checking environment variables..."
    
    local required_vars=(
        "PROXY_API_KEY"
        "AZURE_OPENAI_ENDPOINT"
        "AZURE_OPENAI_API_KEY"
        "AZURE_OPENAI_MODEL"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        exit 1
    fi
    
    log_success "All required environment variables are set"
}

# Validate configuration
validate_configuration() {
    log_info "Validating configuration..."
    
    # Check API key length
    if [[ ${#PROXY_API_KEY} -lt 32 ]]; then
        log_error "PROXY_API_KEY must be at least 32 characters long"
        exit 1
    fi
    
    # Check Azure endpoint format
    if [[ ! "$AZURE_OPENAI_ENDPOINT" =~ ^https:// ]]; then
        log_error "AZURE_OPENAI_ENDPOINT must use HTTPS"
        exit 1
    fi
    
    # Check if endpoint is accessible
    if ! curl -s --head "$AZURE_OPENAI_ENDPOINT" > /dev/null; then
        log_warning "Azure OpenAI endpoint may not be accessible"
    fi
    
    log_success "Configuration validation passed"
}

# Run pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check if pnpm is available
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed or not in PATH"
        exit 1
    fi
    
    # Run tests
    log_info "Running test suite..."
    cd "$PROJECT_ROOT"
    if ! pnpm test --run; then
        log_error "Tests failed. Deployment aborted."
        exit 1
    fi
    
    # Run security checks
    log_info "Running security checks..."
    if ! pnpm run security:all; then
        log_error "Security checks failed. Deployment aborted."
        exit 1
    fi
    
    # Run linting and type checking
    log_info "Running code quality checks..."
    if ! pnpm run lint; then
        log_error "Linting failed. Deployment aborted."
        exit 1
    fi
    
    if ! pnpm run type-check; then
        log_error "Type checking failed. Deployment aborted."
        exit 1
    fi
    
    log_success "Pre-deployment checks passed"
}

# Build the application
build_application() {
    log_info "Building application..."
    
    cd "$PROJECT_ROOT"
    
    # Clean previous build
    rm -rf dist/
    
    # Install dependencies
    pnpm install --frozen-lockfile --ignore-scripts
    
    # Build application
    pnpm run build
    
    # Verify build output
    if [[ ! -f "dist/index.js" ]]; then
        log_error "Build failed - dist/index.js not found"
        exit 1
    fi
    
    log_success "Application built successfully"
}

# Build Docker image
build_docker_image() {
    local image_tag="${1:-claude-proxy:latest}"
    
    log_info "Building Docker image: $image_tag"
    
    cd "$PROJECT_ROOT"
    
    # Build image with build args for better caching
    docker build \
        --tag "$image_tag" \
        --build-arg NODE_ENV=production \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        .
    
    # Verify image was built
    if ! docker image inspect "$image_tag" > /dev/null 2>&1; then
        log_error "Docker image build failed"
        exit 1
    fi
    
    log_success "Docker image built successfully: $image_tag"
}

# Health check function
health_check() {
    local url="${1:-http://localhost:8080/health}"
    local max_retries="${2:-$HEALTH_CHECK_RETRIES}"
    local interval="${3:-$HEALTH_CHECK_INTERVAL}"
    
    log_info "Performing health check: $url"
    
    for ((i=1; i<=max_retries; i++)); do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_success "Health check passed (attempt $i/$max_retries)"
            return 0
        fi
        
        if [[ $i -lt $max_retries ]]; then
            log_info "Health check failed (attempt $i/$max_retries), retrying in ${interval}s..."
            sleep "$interval"
        fi
    done
    
    log_error "Health check failed after $max_retries attempts"
    return 1
}

# Deploy with Docker Compose
deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing containers
    docker-compose down --remove-orphans
    
    # Start new containers
    docker-compose up -d --build
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    sleep 10
    
    # Perform health check
    if ! health_check "http://localhost:${PORT:-8080}/health"; then
        log_error "Deployment failed - health check failed"
        log_info "Rolling back..."
        docker-compose down
        exit 1
    fi
    
    log_success "Docker Compose deployment successful"
}

# Deploy to AWS App Runner
deploy_app_runner() {
    local service_name="${1:-claude-proxy}"
    
    log_info "Deploying to AWS App Runner service: $service_name"
    
    # Check if AWS CLI is available
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS credentials not configured"
        exit 1
    fi
    
    # Create or update App Runner service
    log_info "Creating/updating App Runner service..."
    
    # Note: This is a placeholder - actual implementation would depend on your AWS setup
    log_warning "App Runner deployment requires manual configuration in AWS Console"
    log_info "Use the apprunner.yaml configuration file for deployment"
    
    log_success "App Runner deployment configuration ready"
}

# Rollback function
rollback() {
    local deployment_type="${1:-docker-compose}"
    
    log_warning "Initiating rollback..."
    
    case "$deployment_type" in
        "docker-compose")
            docker-compose down
            # Restore previous version if available
            if docker image inspect claude-proxy:previous > /dev/null 2>&1; then
                docker tag claude-proxy:previous claude-proxy:latest
                docker-compose up -d
                log_success "Rollback completed"
            else
                log_warning "No previous version available for rollback"
            fi
            ;;
        "app-runner")
            log_warning "App Runner rollback must be performed through AWS Console"
            ;;
        *)
            log_error "Unknown deployment type: $deployment_type"
            ;;
    esac
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Remove unused Docker images
    docker image prune -f
    
    # Remove unused containers
    docker container prune -f
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    local deployment_type="${1:-docker-compose}"
    local image_tag="${2:-claude-proxy:latest}"
    
    log_info "Starting deployment process..."
    log_info "Deployment type: $deployment_type"
    log_info "Image tag: $image_tag"
    
    # Set trap for cleanup on exit
    trap cleanup EXIT
    
    # Run deployment steps
    check_environment
    validate_configuration
    pre_deployment_checks
    build_application
    
    case "$deployment_type" in
        "docker-compose")
            build_docker_image "$image_tag"
            deploy_docker_compose
            ;;
        "docker")
            build_docker_image "$image_tag"
            log_success "Docker image ready for deployment: $image_tag"
            ;;
        "app-runner")
            deploy_app_runner
            ;;
        *)
            log_error "Unknown deployment type: $deployment_type"
            log_info "Supported types: docker-compose, docker, app-runner"
            exit 1
            ;;
    esac
    
    log_success "Deployment completed successfully!"
}

# Show usage information
usage() {
    echo "Usage: $0 [deployment-type] [image-tag]"
    echo ""
    echo "Deployment types:"
    echo "  docker-compose  Deploy using Docker Compose (default)"
    echo "  docker          Build Docker image only"
    echo "  app-runner      Deploy to AWS App Runner"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy with Docker Compose"
    echo "  $0 docker claude-proxy:v1.0.0        # Build Docker image"
    echo "  $0 app-runner                        # Deploy to App Runner"
    echo ""
    echo "Environment variables required:"
    echo "  PROXY_API_KEY"
    echo "  AZURE_OPENAI_ENDPOINT"
    echo "  AZURE_OPENAI_API_KEY"
    echo "  AZURE_OPENAI_MODEL"
}

# Handle command line arguments
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    usage
    exit 0
fi

# Run main function with arguments
main "${1:-docker-compose}" "${2:-claude-proxy:latest}"