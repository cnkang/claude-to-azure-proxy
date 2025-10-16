#!/bin/bash

# Fix streaming issues
echo "🔧 Fixing Streaming Issues"
echo "=========================="

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
    CMD="docker compose"
elif docker-compose --version >/dev/null 2>&1; then
    CMD="docker-compose"
else
    echo "❌ Docker Compose not found!"
    exit 1
fi

echo "✅ Streaming support has been implemented!"
echo ""

# Check current container status
echo "📊 Checking container status..."
if $CMD ps | grep -q "claude-proxy.*Up"; then
    echo "✅ Container is running"
    
    # Check logs for streaming errors
    echo ""
    echo "🔍 Checking for streaming errors in logs..."
    if $CMD logs --tail=50 claude-proxy | grep -q "Streaming support will be implemented"; then
        echo "❌ Found old streaming error. Restarting container..."
        $CMD restart claude-proxy
        echo "✅ Container restarted with streaming support"
        
        echo ""
        echo "⏳ Waiting for service to start..."
        sleep 15
    else
        echo "✅ No streaming errors found"
    fi
    
    # Test streaming
    echo ""
    echo "🧪 Testing streaming functionality..."
    if curl -s http://localhost:8080/health >/dev/null; then
        echo "✅ Service is healthy"
        echo ""
        echo "📡 You can now test streaming with:"
        echo "./scripts/test-streaming.sh"
        echo ""
        echo "Or manually:"
        echo "curl -X POST http://localhost:8080/v1/messages \\"
        echo "  -H \"Authorization: Bearer \$PROXY_API_KEY\" \\"
        echo "  -H \"Content-Type: application/json\" \\"
        echo "  -H \"Accept: text/event-stream\" \\"
        echo "  -d '{\"model\":\"claude-3-5-sonnet-20241022\",\"max_tokens\":50,\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":true}' \\"
        echo "  --no-buffer"
    else
        echo "❌ Service not responding. Check logs:"
        echo "$CMD logs --tail=20 claude-proxy"
    fi
else
    echo "❌ Container not running. Starting..."
    $CMD up -d
    echo "⏳ Waiting for service to start..."
    sleep 30
    
    if curl -s http://localhost:8080/health >/dev/null; then
        echo "✅ Service started successfully with streaming support"
    else
        echo "❌ Service failed to start. Check logs:"
        echo "$CMD logs claude-proxy"
    fi
fi

echo ""
echo "📚 Streaming Documentation:"
echo "- Supports both Claude and OpenAI streaming formats"
echo "- Uses Server-Sent Events (SSE) for real-time responses"
echo "- Automatic format detection and conversion"
echo "- Full error handling and recovery"