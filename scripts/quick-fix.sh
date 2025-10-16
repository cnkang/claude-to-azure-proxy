#!/bin/bash

# Ultra-quick Docker health fix
set -e

echo "🚀 Quick Docker Health Fix"
echo "=========================="

# Detect Docker Compose
if docker compose version >/dev/null 2>&1; then
    CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    CMD="docker-compose"
else
    echo "❌ Docker Compose not found!"
    exit 1
fi

echo "Using: $CMD"

# Quick fix sequence
echo "1. Stopping container..."
$CMD down

echo "2. Starting with optimizations..."
$CMD up -d

echo "3. Waiting for startup..."
sleep 30

echo "4. Checking health..."
if curl -s http://localhost:8080/health >/dev/null; then
    echo "✅ Service is responding!"
    curl -s http://localhost:8080/health | jq '.status, .memory.percentage, .azureOpenAI.status' 2>/dev/null || echo "Health check completed"
    
    echo ""
    echo "🧪 Testing streaming (optional):"
    echo "./scripts/test-streaming.sh"
else
    echo "❌ Service not responding yet. Check logs:"
    echo "$CMD logs --tail=10 claude-proxy"
    echo ""
    echo "Common issues:"
    echo "- Configuration validation failed: Run ./scripts/fix-config-validation.sh"
    echo "- Missing .env file: Copy from .env.example and edit"
    echo "- Invalid API keys: Check key lengths and formats"
    echo "- Streaming errors: Check if AZURE_OPENAI_API_VERSION is set correctly"
fi

echo ""
echo "Done! If issues persist, run: ./scripts/fix-docker-health.sh"