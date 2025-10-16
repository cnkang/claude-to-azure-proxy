#!/bin/bash

# Quick fix for configuration validation error
echo "🔧 Fixing configuration validation error..."

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
    CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    CMD="docker-compose"
else
    echo "❌ Docker Compose not found!"
    exit 1
fi

# Stop container
echo "Stopping container..."
$CMD down

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual values:"
    echo "   - PROXY_API_KEY (32+ characters)"
    echo "   - AZURE_OPENAI_ENDPOINT"
    echo "   - AZURE_OPENAI_API_KEY"
    echo "   - AZURE_OPENAI_MODEL"
    echo ""
    echo "Then run: ./scripts/fix-config-validation.sh"
    exit 0
fi

# Validate required variables
echo "Validating environment variables..."
source .env

required_vars=("PROXY_API_KEY" "AZURE_OPENAI_ENDPOINT" "AZURE_OPENAI_API_KEY" "AZURE_OPENAI_MODEL")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-"* ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Missing or invalid environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update your .env file with actual values."
    exit 1
fi

# Check API key length
if [ ${#PROXY_API_KEY} -lt 32 ]; then
    echo "❌ PROXY_API_KEY must be at least 32 characters long"
    echo "Current length: ${#PROXY_API_KEY}"
    echo "Generate a secure key with: openssl rand -base64 32"
    exit 1
fi

# Rebuild and start with fixed configuration
echo "Starting container with fixed configuration..."
$CMD up -d --build

echo "✅ Configuration fix applied!"
echo "Waiting for service to start..."
sleep 30

# Check health
if curl -s http://localhost:8080/health >/dev/null; then
    echo "✅ Service is responding!"
    curl -s http://localhost:8080/health | jq '.status' 2>/dev/null || echo "Health check completed"
else
    echo "⚠️  Service not responding yet. Check logs:"
    echo "$CMD logs claude-proxy"
fi