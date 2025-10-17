#!/bin/bash

# Claude-to-Azure Proxy Rollback Script
# This script handles safe rollback procedures for different deployment types

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
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

# Docker Compose rollback
rollback_docker_compose() {
    local target_version="${1:-previous}"
    
    log_info "Rolling back Docker Compose deployment..."
    
    cd "$PROJECT_ROOT"
    
    # Stop current containers
    log_info "Stopping current containers..."
    docker-compose down --remove-orphans
    
    # Check if target version exists
    if [[ "$target_version" == "previous" ]]; then
        if ! docker image inspect claude-proxy:previous > /dev/null 2>&1; then
            log_error "No previous version found (claude-proxy:previous)"
            log_info "Available images:"
            docker images claude-proxy --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}"
            exit 1
        fi
        
        # Tag previous version as latest
        log_info "Restoring previous version..."
        docker tag claude-proxy:previous claude-proxy:latest
    else
        # Use specific version
        if ! docker image inspect "claude-proxy:$target_version" > /dev/null 2>&1; then
            log_error "Target version not found: claude-proxy:$target_version"
            exit 1
        fi
        
        log_info "Rolling back to version: $target_version"
        docker tag "claude-proxy:$target_version" claude-proxy:latest
    fi
    
    # Start containers with rolled back version
    log_info "Starting containers with rolled back version..."
    docker-compose up -d
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    sleep 15
    
    # Perform health check
    if ! health_check "http://localhost:${PORT:-8080}/health"; then
        log_error "Rollback failed - service is not healthy"
        return 1
    fi
    
    log_success "Docker Compose rollback completed successfully"
}

# Docker rollback (standalone)
rollback_docker() {
    local container_name="${1:-claude-proxy}"
    local target_version="${2:-previous}"
    
    log_info "Rolling back Docker container: $container_name"
    
    # Stop and remove current container
    if docker ps -q -f name="$container_name" | grep -q .; then
        log_info "Stopping current container..."
        docker stop "$container_name"
        docker rm "$container_name"
    fi
    
    # Determine target image
    local target_image
    if [[ "$target_version" == "previous" ]]; then
        target_image="claude-proxy:previous"
    else
        target_image="claude-proxy:$target_version"
    fi
    
    # Check if target image exists
    if ! docker image inspect "$target_image" > /dev/null 2>&1; then
        log_error "Target image not found: $target_image"
        log_info "Available images:"
        docker images claude-proxy --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}"
        exit 1
    fi
    
    # Start container with rolled back version
    log_info "Starting container with image: $target_image"
    docker run -d \
        --name "$container_name" \
        --init \
        -p "${PORT:-8080}:${PORT:-8080}" \
        -e NODE_ENV=production \
        -e PORT="${PORT:-8080}" \
        -e PROXY_API_KEY="$PROXY_API_KEY" \
        -e AZURE_OPENAI_ENDPOINT="$AZURE_OPENAI_ENDPOINT" \
        -e AZURE_OPENAI_API_KEY="$AZURE_OPENAI_API_KEY" \
        -e AZURE_OPENAI_MODEL="$AZURE_OPENAI_MODEL" \
        -e AZURE_OPENAI_API_VERSION="${AZURE_OPENAI_API_VERSION:-}" \
        -e AZURE_OPENAI_TIMEOUT="${AZURE_OPENAI_TIMEOUT:-120000}" \
        -e AZURE_OPENAI_MAX_RETRIES="${AZURE_OPENAI_MAX_RETRIES:-3}" \
        -e DEFAULT_REASONING_EFFORT="${DEFAULT_REASONING_EFFORT:-medium}" \
        --restart unless-stopped \
        "$target_image"
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    sleep 15
    
    # Perform health check
    if ! health_check "http://localhost:${PORT:-8080}/health"; then
        log_error "Rollback failed - service is not healthy"
        return 1
    fi
    
    log_success "Docker rollback completed successfully"
}

# AWS App Runner rollback
rollback_app_runner() {
    local service_name="${1:-claude-proxy}"
    
    log_warning "AWS App Runner rollback must be performed through AWS Console or CLI"
    log_info "Steps to rollback App Runner service:"
    log_info "1. Go to AWS App Runner console"
    log_info "2. Select service: $service_name"
    log_info "3. Go to 'Deployments' tab"
    log_info "4. Select a previous deployment"
    log_info "5. Click 'Redeploy'"
    
    # Check if AWS CLI is available for automated rollback
    if command -v aws &> /dev/null && aws sts get-caller-identity > /dev/null 2>&1; then
        log_info "AWS CLI is available. Attempting automated rollback..."
        
        # List recent deployments
        log_info "Recent deployments for service $service_name:"
        aws apprunner list-operations \
            --service-arn "$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$service_name'].ServiceArn" --output text)" \
            --query 'OperationSummaryList[?Type==`START_DEPLOYMENT`].[OperationId,Status,StartedAt]' \
            --output table || log_warning "Could not list deployments"
        
        log_warning "Automated App Runner rollback is not implemented"
        log_info "Please use the AWS Console for rollback"
    else
        log_warning "AWS CLI not available or not configured"
    fi
}

# Kubernetes rollback (if using Kubernetes)
rollback_kubernetes() {
    local deployment_name="${1:-claude-proxy}"
    local namespace="${2:-default}"
    
    log_info "Rolling back Kubernetes deployment: $deployment_name"
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if deployment exists
    if ! kubectl get deployment "$deployment_name" -n "$namespace" > /dev/null 2>&1; then
        log_error "Deployment not found: $deployment_name in namespace $namespace"
        exit 1
    fi
    
    # Perform rollback
    log_info "Rolling back deployment..."
    kubectl rollout undo deployment/"$deployment_name" -n "$namespace"
    
    # Wait for rollback to complete
    log_info "Waiting for rollback to complete..."
    kubectl rollout status deployment/"$deployment_name" -n "$namespace" --timeout=300s
    
    # Get service URL for health check
    local service_url
    service_url=$(kubectl get service "$deployment_name" -n "$namespace" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "localhost")
    local port
    port=$(kubectl get service "$deployment_name" -n "$namespace" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "8080")
    
    # Perform health check
    if ! health_check "http://$service_url:$port/health"; then
        log_error "Rollback failed - service is not healthy"
        return 1
    fi
    
    log_success "Kubernetes rollback completed successfully"
}

# List available versions
list_versions() {
    local deployment_type="${1:-docker}"
    
    log_info "Available versions for rollback:"
    
    case "$deployment_type" in
        "docker"|"docker-compose")
            log_info "Docker images:"
            docker images claude-proxy --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" | head -10
            ;;
        "kubernetes")
            log_info "Kubernetes rollout history:"
            kubectl rollout history deployment/claude-proxy 2>/dev/null || log_warning "No Kubernetes deployment found"
            ;;
        "app-runner")
            log_info "App Runner deployments (requires AWS CLI):"
            if command -v aws &> /dev/null && aws sts get-caller-identity > /dev/null 2>&1; then
                aws apprunner list-operations \
                    --service-arn "$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='claude-proxy'].ServiceArn" --output text)" \
                    --query 'OperationSummaryList[?Type==`START_DEPLOYMENT`].[OperationId,Status,StartedAt]' \
                    --output table 2>/dev/null || log_warning "Could not list App Runner deployments"
            else
                log_warning "AWS CLI not available"
            fi
            ;;
        *)
            log_error "Unknown deployment type: $deployment_type"
            ;;
    esac
}

# Backup current version before rollback
backup_current_version() {
    local deployment_type="${1:-docker}"
    
    log_info "Backing up current version..."
    
    case "$deployment_type" in
        "docker"|"docker-compose")
            # Tag current version as backup
            if docker image inspect claude-proxy:latest > /dev/null 2>&1; then
                local backup_tag="claude-proxy:backup-$(date +%Y%m%d-%H%M%S)"
                docker tag claude-proxy:latest "$backup_tag"
                log_success "Current version backed up as: $backup_tag"
            else
                log_warning "No current version found to backup"
            fi
            ;;
        *)
            log_info "Backup not implemented for deployment type: $deployment_type"
            ;;
    esac
}

# Verify rollback
verify_rollback() {
    local deployment_type="${1:-docker-compose}"
    
    log_info "Verifying rollback..."
    
    # Perform health check
    if ! health_check "http://localhost:${PORT:-8080}/health"; then
        log_error "Rollback verification failed - service is not healthy"
        return 1
    fi
    
    # Check service info
    local service_info
    service_info=$(curl -s "http://localhost:${PORT:-8080}/" 2>/dev/null || echo "{}")
    
    if [[ -n "$service_info" ]]; then
        log_info "Service information after rollback:"
        echo "$service_info" | jq . 2>/dev/null || echo "$service_info"
    fi
    
    log_success "Rollback verification completed"
}

# Main rollback function
main() {
    local deployment_type="${1:-docker-compose}"
    local target_version="${2:-previous}"
    
    log_info "Starting rollback process..."
    log_info "Deployment type: $deployment_type"
    log_info "Target version: $target_version"
    
    # Backup current version
    backup_current_version "$deployment_type"
    
    # Perform rollback based on deployment type
    case "$deployment_type" in
        "docker-compose")
            rollback_docker_compose "$target_version"
            ;;
        "docker")
            rollback_docker "claude-proxy" "$target_version"
            ;;
        "app-runner")
            rollback_app_runner "claude-proxy"
            ;;
        "kubernetes"|"k8s")
            rollback_kubernetes "claude-proxy" "default"
            ;;
        "list")
            list_versions "${2:-docker}"
            exit 0
            ;;
        *)
            log_error "Unknown deployment type: $deployment_type"
            log_info "Supported types: docker-compose, docker, app-runner, kubernetes, list"
            exit 1
            ;;
    esac
    
    # Verify rollback
    verify_rollback "$deployment_type"
    
    log_success "Rollback completed successfully!"
}

# Show usage information
usage() {
    echo "Usage: $0 [deployment-type] [target-version]"
    echo ""
    echo "Deployment types:"
    echo "  docker-compose  Rollback Docker Compose deployment (default)"
    echo "  docker          Rollback standalone Docker container"
    echo "  app-runner      Rollback AWS App Runner service"
    echo "  kubernetes      Rollback Kubernetes deployment"
    echo "  list            List available versions"
    echo ""
    echo "Target versions:"
    echo "  previous        Use previous version (default)"
    echo "  v1.0.0          Use specific version tag"
    echo "  backup-date     Use specific backup"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Rollback Docker Compose to previous"
    echo "  $0 docker v1.0.0                     # Rollback Docker to v1.0.0"
    echo "  $0 list docker                       # List available Docker versions"
    echo "  $0 app-runner                        # Rollback App Runner service"
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
main "${1:-docker-compose}" "${2:-previous}"