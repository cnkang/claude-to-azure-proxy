#!/bin/bash

# Test streaming functionality
echo "🧪 Testing Streaming Functionality"
echo "=================================="

# Check if service is running
if ! curl -s http://localhost:8080/health >/dev/null; then
    echo "❌ Service not running. Start with: docker compose up -d"
    exit 1
fi

echo "✅ Service is running"

# Test streaming request
echo ""
echo "📡 Testing streaming request..."

# Claude format streaming test
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer ${PROXY_API_KEY:-test-key}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [
      {
        "role": "user",
        "content": "Count from 1 to 5, one number per line"
      }
    ],
    "stream": true
  }' \
  --no-buffer \
  -v

echo ""
echo "🔍 Check logs for streaming details:"
echo "docker compose logs --tail=20 claude-proxy"