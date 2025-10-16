#!/bin/bash

# Quick fix script for Docker health issues
set -e

echo "🔧 Quick Fix for Docker Health Issues"
echo "====================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${YELLOW}[FIX]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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

# Stop the current container
print_status "Stopping current container..."
$COMPOSE_CMD down

# Apply memory fixes
print_status "Applying memory optimizations..."
if [ ! -f docker-compose.override.yml ]; then
    print_status "Creating docker-compose.override.yml from example..."
    cp docker-compose.override.yml.example docker-compose.override.yml
else
    print_status "docker-compose.override.yml already exists, updating..."
fi

cat > docker-compose.override.yml << 'EOF'
version: '3.8'

services:
  claude-proxy:
    # Increase memory limits
    mem_limit: 512m
    mem_reservation: 256m
    memswap_limit: 512m
    
    # Optimize Node.js memory settings
    environment:
      - NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=64
      
    # Extend healthcheck timeouts
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 15s
      retries: 3
      start_period: 60s
EOF

print_success "Memory optimizations applied"

# Check environment variables
print_status "Checking environment configuration..."
if [ ! -f .env ]; then
    print_error ".env file missing. Please create it from .env.example"
    exit 1
fi

# Validate Azure OpenAI endpoint format
source .env
if [[ ! "$AZURE_OPENAI_ENDPOINT" =~ ^https://.*\.openai\.azure\.com/?$ ]]; then
    print_error "AZURE_OPENAI_ENDPOINT format may be incorrect"
    echo "Expected format: https://your-resource.openai.azure.com"
    echo "Current value: $AZURE_OPENAI_ENDPOINT"
fi

# Start with optimized settings
print_status "Starting container with optimizations..."
$COMPOSE_CMD up -d

# Wait for startup
print_status "Waiting for service to start..."
sleep 30

# Check health
print_status "Checking health status..."
for i in {1..6}; do
    if curl -s http://localhost:8080/health > /dev/null; then
        health_status=$(curl -s http://localhost:8080/health | jq -r '.status' 2>/dev/null || echo "unknown")
        memory_pct=$(curl -s http://localhost:8080/health | jq -r '.memory.percentage' 2>/dev/null || echo "unknown")
        
        print_status "Attempt $i: Status=$health_status, Memory=$memory_pct%"
        
        if [ "$health_status" = "healthy" ]; then
            print_success "Service is now healthy!"
            break
        fi
    else
        print_status "Attempt $i: Service not responding yet..."
    fi
    
    if [ $i -lt 6 ]; then
        sleep 10
    fi
done

# Final status
echo ""
print_status "Final health check:"
curl -s http://localhost:8080/health | jq '.' || print_error "Health check failed"

echo ""
print_status "Container logs (last 10 lines):"
$COMPOSE_CMD logs --tail=10 claude-proxy

echo ""
print_success "Fix script completed. If issues persist, run: ./scripts/docker-debug.sh"