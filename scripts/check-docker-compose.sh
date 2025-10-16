#!/bin/bash

# Check Docker Compose version and provide correct commands
echo "🔍 Checking Docker Compose installation..."

# Check if docker compose (new) is available
if docker compose version >/dev/null 2>&1; then
    echo "✅ Docker Compose (integrated) is available"
    echo "Use: docker compose"
    COMPOSE_CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    echo "⚠️  Docker Compose (standalone) is available"
    echo "Use: docker-compose"
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found!"
    echo "Please install Docker Compose:"
    echo "  - For Docker Desktop: Update to latest version"
    echo "  - For Linux: Install docker-compose-plugin"
    exit 1
fi

echo ""
echo "📋 Correct commands for your system:"
echo "  Stop:    $COMPOSE_CMD down"
echo "  Start:   $COMPOSE_CMD up -d"
echo "  Logs:    $COMPOSE_CMD logs -f claude-proxy"
echo "  Status:  $COMPOSE_CMD ps"
echo "  Restart: $COMPOSE_CMD restart"

# Export for other scripts
export COMPOSE_CMD
echo "COMPOSE_CMD=$COMPOSE_CMD" > .compose_cmd