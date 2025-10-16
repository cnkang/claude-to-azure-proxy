#!/bin/bash

# Docker setup script for Claude-to-Azure Proxy
set -e

echo "🐳 Docker Setup for Claude-to-Azure Proxy"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

# Detect Docker Compose
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

print_info "Using Docker Compose command: $COMPOSE_CMD"

# Setup environment file
if [ ! -f .env ]; then
    print_info "Creating .env file from template..."
    cp .env.example .env
    print_warning "Please edit .env file with your actual configuration:"
    echo "  - PROXY_API_KEY"
    echo "  - AZURE_OPENAI_ENDPOINT"
    echo "  - AZURE_OPENAI_API_KEY"
    echo "  - AZURE_OPENAI_MODEL"
    echo ""
    echo "Then run this script again."
    exit 0
else
    print_success ".env file exists"
fi

# Setup Docker override file for memory optimization
if [ ! -f docker-compose.override.yml ]; then
    print_info "Creating docker-compose.override.yml for memory optimization..."
    cp docker-compose.override.yml.example docker-compose.override.yml
    print_success "Memory optimization settings applied"
else
    print_info "docker-compose.override.yml already exists"
fi

# Build and start
print_info "Building and starting containers..."
$COMPOSE_CMD up -d --build

# Wait for startup
print_info "Waiting for service to start..."
sleep 30

# Check health
print_info "Checking service health..."
if curl -s http://localhost:8080/health >/dev/null; then
    health_status=$(curl -s http://localhost:8080/health | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$health_status" = "healthy" ]; then
        print_success "Service is healthy and ready!"
    else
        print_warning "Service is running but not healthy. Check logs:"
        echo "$COMPOSE_CMD logs claude-proxy"
    fi
else
    print_warning "Service not responding. Check logs:"
    echo "$COMPOSE_CMD logs claude-proxy"
fi

echo ""
print_info "Setup complete! Useful commands:"
echo "  Health check: curl http://localhost:8080/health"
echo "  View logs:    $COMPOSE_CMD logs -f claude-proxy"
echo "  Restart:      $COMPOSE_CMD restart"
echo "  Stop:         $COMPOSE_CMD down"
echo ""
print_info "For troubleshooting, run: ./scripts/docker-debug.sh"