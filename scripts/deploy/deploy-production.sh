#!/bin/bash

# Production Deployment Script for Claude-to-Azure Proxy
# Supports multiple deployment targets: docker-compose, kubernetes, aws-app-runner

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
DEPLOYMENT_TARGET=${1:-"docker-compose"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
VERSION=${VERSION:-"2.0.0"}
CDN_URL=${CDN_URL:-""}

# Deployment configurations
COMPOSE_FILE=""
case "$DEPLOYMENT_TARGET" in
    "docker-compose")
        COMPOSE_FILE="docker-compose.prod.yml"
        ;;
    "docker-compose-cdn")
        COMPOSE_FILE="docker-compose.prod-cdn.yml"
        ;;
    "kubernetes")
        COMPOSE_FILE=""
        ;;
    "aws-app-runner")
        COMPOSE_FILE=""
        ;;
    *)
        echo -e "${RED}❌ Unknown deployment target: $DEPLOYMENT_TARGET${NC}"
        echo "Supported targets: docker-compose, docker-compose-cdn, kubernetes, aws-app-runner"
        exit 1
        ;;
esac

echo -e "${BLUE}🚀 Starting Production Deployment${NC}"
echo -e "${BLUE}===================================${NC}"
echo -e "Deployment Target: ${DEPLOYMENT_TARGET}"
echo -e "Environment: ${ENVIRONMENT}"
echo -e "Version: ${VERSION}"
echo -e "CDN URL: ${CDN_URL:-"(not set)"}"
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

case "$DEPLOYMENT_TARGET" in
    "docker-compose"|"docker-compose-cdn")
        if ! command_exists docker; then
            echo -e "${RED}❌ Docker is not installed${NC}"
            exit 1
        fi
        if ! command_exists docker-compose; then
            echo -e "${RED}❌ Docker Compose is not installed${NC}"
            exit 1
        fi
        ;;
    "kubernetes")
        if ! command_exists kubectl; then
            echo -e "${RED}❌ kubectl is not installed${NC}"
            exit 1
        fi
        ;;
    "aws-app-runner")
        if ! command_exists aws; then
            echo -e "${RED}❌ AWS CLI is not installed${NC}"
            exit 1
        fi
        ;;
esac

echo -e "${GREEN}✅ All prerequisites satisfied${NC}"

# Validate environment configuration
print_step "Validating Environment Configuration"

if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create .env file from .env.example"
    exit 1
fi

# Check required environment variables
REQUIRED_VARS=("PROXY_API_KEY" "AZURE_OPENAI_ENDPOINT" "AZURE_OPENAI_API_KEY" "AZURE_OPENAI_MODEL")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo -e "${RED}❌ Required environment variable $var is not set${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Environment configuration validated${NC}"

# Pre-deployment health check
print_step "Pre-deployment Health Check"

# Check if services are already running
case "$DEPLOYMENT_TARGET" in
    "docker-compose"|"docker-compose-cdn")
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
            echo -e "${YELLOW}⚠️  Services are already running${NC}"
            echo "Stopping existing services..."
            docker-compose -f "$COMPOSE_FILE" down
        fi
        ;;
esac

echo -e "${GREEN}✅ Pre-deployment check completed${NC}"

# Deploy based on target
case "$DEPLOYMENT_TARGET" in
    "docker-compose"|"docker-compose-cdn")
        deploy_docker_compose
        ;;
    "kubernetes")
        deploy_kubernetes
        ;;
    "aws-app-runner")
        deploy_aws_app_runner
        ;;
esac

# Function to deploy with Docker Compose
deploy_docker_compose() {
    print_step "Deploying with Docker Compose"
    
    echo "Using compose file: $COMPOSE_FILE"
    
    # Set build arguments
    export BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    export COMMIT_HASH=${COMMIT_HASH:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}
    export VERSION="$VERSION"
    export CDN_URL="$CDN_URL"
    export BUILD_TARGET="$ENVIRONMENT"
    export ENABLE_ANALYTICS="true"
    export ENABLE_ERROR_REPORTING="true"
    
    # Build and start services
    echo "Building and starting services..."
    docker-compose -f "$COMPOSE_FILE" up -d --build
    
    # Wait for services to be healthy
    echo "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
        echo -e "${RED}❌ Some services are unhealthy${NC}"
        docker-compose -f "$COMPOSE_FILE" ps
        docker-compose -f "$COMPOSE_FILE" logs
        exit 1
    fi
    
    echo -e "${GREEN}✅ Docker Compose deployment completed${NC}"
    
    # Show service status
    echo -e "\n${BLUE}Service Status:${NC}"
    docker-compose -f "$COMPOSE_FILE" ps
    
    # Show access URLs
    echo -e "\n${BLUE}Access URLs:${NC}"
    echo -e "  Backend API: http://localhost:${PORT:-8080}"
    echo -e "  Frontend: http://localhost:${FRONTEND_PORT:-80}"
    if [ "$DEPLOYMENT_TARGET" = "docker-compose-cdn" ]; then
        echo -e "  CDN Cache: http://localhost:${CDN_PORT:-8081}"
    fi
}

# Function to deploy to Kubernetes
deploy_kubernetes() {
    print_step "Deploying to Kubernetes"
    
    # Check if kubectl is configured
    if ! kubectl cluster-info >/dev/null 2>&1; then
        echo -e "${RED}❌ kubectl is not configured or cluster is not accessible${NC}"
        exit 1
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace claude-proxy --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply Kubernetes manifests
    if [ -d "infra/k8s" ]; then
        echo "Applying Kubernetes manifests..."
        kubectl apply -f infra/k8s/ -n claude-proxy
        
        # Wait for deployment to be ready
        echo "Waiting for deployment to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/backend -n claude-proxy
        kubectl wait --for=condition=available --timeout=300s deployment/frontend -n claude-proxy
        
        echo -e "${GREEN}✅ Kubernetes deployment completed${NC}"
        
        # Show deployment status
        echo -e "\n${BLUE}Deployment Status:${NC}"
        kubectl get pods -n claude-proxy
        kubectl get services -n claude-proxy
    else
        echo -e "${RED}❌ Kubernetes manifests not found in infra/k8s${NC}"
        exit 1
    fi
}

# Function to deploy to AWS App Runner
deploy_aws_app_runner() {
    print_step "Deploying to AWS App Runner"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        echo -e "${RED}❌ AWS credentials not configured${NC}"
        exit 1
    fi
    
    # Build and push images to ECR
    echo "Building and pushing images to ECR..."
    
    # Get AWS account ID and region
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_REGION=${AWS_REGION:-$(aws configure get region)}
    
    if [ -z "$AWS_REGION" ]; then
        echo -e "${RED}❌ AWS region not configured${NC}"
        exit 1
    fi
    
    # ECR repository URLs
    BACKEND_ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/claude-proxy-backend"
    FRONTEND_ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/claude-proxy-frontend"
    
    # Login to ECR
    aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    # Create ECR repositories if they don't exist
    aws ecr create-repository --repository-name claude-proxy-backend --region "$AWS_REGION" 2>/dev/null || true
    aws ecr create-repository --repository-name claude-proxy-frontend --region "$AWS_REGION" 2>/dev/null || true
    
    # Build and push backend
    docker build -f apps/backend/Dockerfile -t "$BACKEND_ECR_URI:$VERSION" -t "$BACKEND_ECR_URI:latest" .
    docker push "$BACKEND_ECR_URI:$VERSION"
    docker push "$BACKEND_ECR_URI:latest"
    
    # Build and push frontend
    docker build -f apps/frontend/Dockerfile -t "$FRONTEND_ECR_URI:$VERSION" -t "$FRONTEND_ECR_URI:latest" \
        --build-arg CDN_URL="$CDN_URL" \
        --build-arg BUILD_TARGET="$ENVIRONMENT" .
    docker push "$FRONTEND_ECR_URI:$VERSION"
    docker push "$FRONTEND_ECR_URI:latest"
    
    echo -e "${GREEN}✅ Images pushed to ECR${NC}"
    
    # Deploy to App Runner (this would typically use CloudFormation or Terraform)
    echo -e "${YELLOW}⚠️  App Runner deployment requires additional configuration${NC}"
    echo "Please use the apprunner.yaml configuration file to deploy to AWS App Runner"
    echo "Backend image: $BACKEND_ECR_URI:$VERSION"
    echo "Frontend image: $FRONTEND_ECR_URI:$VERSION"
}

# Post-deployment validation
print_step "Post-deployment Validation"

case "$DEPLOYMENT_TARGET" in
    "docker-compose"|"docker-compose-cdn")
        # Test backend health
        echo "Testing backend health..."
        if curl -f "http://localhost:${PORT:-8080}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend health check passed${NC}"
        else
            echo -e "${RED}❌ Backend health check failed${NC}"
            exit 1
        fi
        
        # Test frontend health
        echo "Testing frontend health..."
        if curl -f "http://localhost:${FRONTEND_PORT:-80}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Frontend health check passed${NC}"
        else
            echo -e "${RED}❌ Frontend health check failed${NC}"
            exit 1
        fi
        ;;
esac

echo -e "${GREEN}✅ Post-deployment validation completed${NC}"

# Generate deployment report
print_step "Generating Deployment Report"

DEPLOYMENT_REPORT="deployment-report-$(date -u +%Y%m%d-%H%M%S).json"

cat > "$DEPLOYMENT_REPORT" << EOF
{
  "deploymentDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deploymentTarget": "$DEPLOYMENT_TARGET",
  "environment": "$ENVIRONMENT",
  "version": "$VERSION",
  "cdnUrl": "$CDN_URL",
  "composeFile": "$COMPOSE_FILE",
  "status": "success"
}
EOF

echo -e "${GREEN}✅ Deployment report generated: $DEPLOYMENT_REPORT${NC}"

# Summary
print_step "Deployment Summary"

echo -e "${GREEN}🎉 Production deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}Deployment Details:${NC}"
echo -e "  Target: $DEPLOYMENT_TARGET"
echo -e "  Environment: $ENVIRONMENT"
echo -e "  Version: $VERSION"
echo -e "  CDN URL: ${CDN_URL:-"(not configured)"}"
echo ""
echo -e "${BLUE}Deployment Report: $DEPLOYMENT_REPORT${NC}"

exit 0