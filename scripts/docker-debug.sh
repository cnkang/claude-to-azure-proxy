#!/bin/bash

# Docker Debug Script for Claude-to-Azure Proxy
# This script helps diagnose and fix common Docker deployment issues

set -e

echo "🔍 Claude-to-Azure Proxy Docker Debug Script"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose not found! Please install Docker Compose."
    exit 1
fi

print_status "Using Docker Compose command: $COMPOSE_CMD"

# Check if Docker is running
print_status "Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi
print_success "Docker is running"

# Check if .env file exists
print_status "Checking environment configuration..."
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp .env.example .env
    print_warning "Please edit .env file with your actual configuration before continuing."
    echo "Required variables:"
    echo "  - PROXY_API_KEY"
    echo "  - AZURE_OPENAI_ENDPOINT"
    echo "  - AZURE_OPENAI_API_KEY"
    echo "  - AZURE_OPENAI_MODEL"
    exit 1
fi
print_success ".env file found"

# Validate required environment variables
print_status "Validating environment variables..."
source .env

required_vars=("PROXY_API_KEY" "AZURE_OPENAI_ENDPOINT" "AZURE_OPENAI_API_KEY" "AZURE_OPENAI_MODEL")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-"* ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    print_error "Missing or invalid environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    print_error "Please update your .env file with actual values."
    exit 1
fi
print_success "All required environment variables are set"

# Check container status
print_status "Checking container status..."
if $COMPOSE_CMD ps | grep -q "claude-proxy"; then
    container_status=$($COMPOSE_CMD ps --format "table {{.Service}}\t{{.State}}" | grep claude-proxy | awk '{print $2}')
    print_status "Container status: $container_status"
    
    if [ "$container_status" = "Up" ]; then
        print_success "Container is running"
        
        # Check health status
        print_status "Checking health status..."
        health_response=$(curl -s http://localhost:8080/health || echo "failed")
        
        if [ "$health_response" = "failed" ]; then
            print_error "Health check failed - service not responding"
        else
            status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "unknown")
            memory_pct=$(echo "$health_response" | jq -r '.memory.percentage' 2>/dev/null || echo "unknown")
            azure_status=$(echo "$health_response" | jq -r '.azureOpenAI.status' 2>/dev/null || echo "unknown")
            
            print_status "Health Status: $status"
            print_status "Memory Usage: $memory_pct%"
            print_status "Azure OpenAI: $azure_status"
            
            if [ "$status" = "unhealthy" ]; then
                print_warning "Service is unhealthy. Checking issues..."
                
                if [ "$memory_pct" != "unknown" ] && [ "$memory_pct" -gt 85 ]; then
                    print_error "High memory usage detected ($memory_pct%)"
                    print_status "Recommended actions:"
                    echo "  1. Increase Docker memory limits"
                    echo "  2. Restart the container"
                    echo "  3. Check for memory leaks"
                fi
                
                if [ "$azure_status" = "disconnected" ]; then
                    print_error "Azure OpenAI connection failed"
                    print_status "Recommended actions:"
                    echo "  1. Verify AZURE_OPENAI_ENDPOINT is correct"
                    echo "  2. Check AZURE_OPENAI_API_KEY is valid"
                    echo "  3. Ensure network connectivity to Azure"
                fi
            else
                print_success "Service is healthy"
            fi
        fi
    else
        print_error "Container is not running properly"
    fi
else
    print_warning "Container not found"
fi

# Show container logs
print_status "Recent container logs:"
echo "========================"
$COMPOSE_CMD logs --tail=20 claude-proxy || print_warning "Could not retrieve logs"

# Show resource usage
print_status "Container resource usage:"
echo "=========================="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep claude || print_warning "Could not retrieve stats"

# Provide recommendations
echo ""
print_status "Troubleshooting Recommendations:"
echo "================================="
echo "1. If memory usage is high (>85%):"
echo "   - Restart container: docker-compose restart"
echo "   - Increase memory limits in docker-compose.override.yml"
echo ""
echo "2. If Azure OpenAI connection fails:"
echo "   - Test endpoint manually: curl -H \"Authorization: Bearer \$AZURE_OPENAI_API_KEY\" \"\$AZURE_OPENAI_ENDPOINT/openai/v1/models\""
echo "   - Verify endpoint format: should end with /openai/v1/"
echo ""
echo "3. If container won't start:"
echo "   - Check logs: docker-compose logs claude-proxy"
echo "   - Rebuild image: docker-compose build --no-cache"
echo ""
echo "4. Quick fixes:"
echo "   - Restart: $COMPOSE_CMD restart"
echo "   - Full reset: $COMPOSE_CMD down && $COMPOSE_CMD up -d"
echo ""

print_success "Debug script completed"