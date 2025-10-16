# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Claude-to-Azure OpenAI Proxy using the v1 Responses API.

## 🔍 Quick Diagnostics

### Health Check

First, verify the service is running and healthy:

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "correlationId": "uuid-here",
  "checks": {
    "memory": {
      "status": "healthy",
      "responseTime": 1,
      "message": "Memory usage: 45.2%"
    }
  }
}
```

### Configuration Validation

Check if your environment variables are properly configured:

```bash
# Run configuration validation
pnpm run validate:config

# Or check manually
node -e "
require('dotenv').config();
const required = ['PROXY_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_MODEL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.log('❌ Missing required variables:', missing);
} else {
  console.log('✅ All required variables are set');
}
"
```

## 🚨 Common Issues

### 1. Authentication Errors

#### Symptoms
- HTTP 401 responses
- "Invalid credentials" errors
- Authentication failures in logs

#### Solutions

**Check Proxy API Key:**
```bash
# Verify your proxy API key is set and valid
echo "PROXY_API_KEY length: ${#PROXY_API_KEY}"
# Should be 32-256 characters

# Test authentication
curl -H "Authorization: Bearer your-proxy-api-key" \
     http://localhost:8080/v1/models
```

**Check Azure OpenAI API Key:**
```bash
# Test Azure OpenAI connectivity directly
curl -H "Authorization: Bearer your-azure-api-key" \
     "https://your-resource.openai.azure.com/openai/v1/models"
```

**Common fixes:**
- Ensure `PROXY_API_KEY` is 32+ characters
- Verify `AZURE_OPENAI_API_KEY` is valid and not expired
- Check API key permissions in Azure portal
- Ensure endpoint URL is correct (must be HTTPS)

### 2. Responses API Connection Issues

#### Symptoms
- "Service unavailable" errors
- Timeout errors
- Connection refused errors

#### Solutions

**Verify Endpoint Configuration:**
```bash
# Check if endpoint is accessible
curl -I "https://your-resource.openai.azure.com/openai/v1/"

# Verify endpoint format (should end with /openai/v1/)
echo $AZURE_OPENAI_ENDPOINT
```

**Check API Version:**
```bash
# For GA v1 API, don't set AZURE_OPENAI_API_VERSION
unset AZURE_OPENAI_API_VERSION

# For preview features, set to "preview"
export AZURE_OPENAI_API_VERSION=preview
```

**Timeout Configuration:**
```bash
# Increase timeout for complex reasoning tasks
export AZURE_OPENAI_TIMEOUT=120000  # 2 minutes

# Adjust retry attempts
export AZURE_OPENAI_MAX_RETRIES=5
```

### 3. Reasoning Effort Issues

#### Symptoms
- Responses are too slow
- Responses lack depth for complex tasks
- Inconsistent response quality

#### Solutions

**Adjust Default Reasoning Effort:**
```bash
# For faster responses (simple tasks)
export DEFAULT_REASONING_EFFORT=minimal

# For better quality (complex tasks)
export DEFAULT_REASONING_EFFORT=high
```

**Check Automatic Detection:**
The proxy automatically detects task complexity. Check logs for reasoning decisions:
```bash
# Look for reasoning effort logs
grep "reasoning_effort" logs/app.log
```

**Manual Override:**
You can override reasoning effort in requests:
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [...],
  "reasoning": {
    "effort": "high"
  }
}
```

### 4. Format Detection Issues

#### Symptoms
- Wrong response format
- "Unsupported request format" errors
- Inconsistent behavior between clients

#### Solutions

**Check Request Format:**
```bash
# Claude format example
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# OpenAI format example
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Debug Format Detection:**
Enable debug logging to see format detection:
```bash
export LOG_LEVEL=debug
pnpm start
```

### 5. Streaming Issues

#### Symptoms
- Streaming responses not working
- Incomplete streaming data
- Connection drops during streaming

#### Solutions

**Test Streaming:**
```bash
# Claude format streaming
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Count to 10"}],
    "stream": true
  }'
```

**Check Network Configuration:**
- Ensure proxy/load balancer supports streaming
- Verify timeout settings allow for long connections
- Check if client properly handles Server-Sent Events

### 6. Memory and Performance Issues

#### Symptoms
- High memory usage
- Slow response times
- Service crashes under load

#### Solutions

**Monitor Memory:**
```bash
# Check memory usage
curl http://localhost:8080/health | jq '.checks.memory'

# Monitor with top/htop
top -p $(pgrep -f "node.*index.js")
```

**Optimize Configuration:**
```bash
# Reduce timeout for faster failure
export AZURE_OPENAI_TIMEOUT=30000

# Limit concurrent requests
export MAX_CONCURRENT_REQUESTS=10

# Enable garbage collection logging
export NODE_OPTIONS="--max-old-space-size=2048 --gc-interval=100"
```

**Conversation Cleanup:**
The proxy automatically cleans up old conversations. Check configuration:
```bash
# Conversation cleanup settings (in config)
export CONVERSATION_MAX_AGE=3600000  # 1 hour
export CONVERSATION_CLEANUP_INTERVAL=300000  # 5 minutes
```

## 🔧 Advanced Debugging

### Enable Debug Logging

```bash
export LOG_LEVEL=debug
export LOG_FORMAT=json
pnpm start
```

### Correlation ID Tracking

Every request gets a correlation ID for tracing:

```bash
# Find all logs for a specific request
grep "correlation-id-here" logs/app.log

# Extract correlation ID from response headers
curl -I http://localhost:8080/v1/models \
  -H "Authorization: Bearer your-key" | grep -i correlation
```

### Performance Profiling

```bash
# Enable performance profiling
export ENABLE_PROFILING=true
pnpm start

# Check performance metrics
curl http://localhost:8080/metrics
```

### Network Debugging

```bash
# Test network connectivity to Azure
ping your-resource.openai.azure.com

# Check DNS resolution
nslookup your-resource.openai.azure.com

# Test SSL/TLS connection
openssl s_client -connect your-resource.openai.azure.com:443
```

## 📊 Monitoring and Alerts

### Key Metrics to Monitor

1. **Response Times**: Should be < 5 seconds for most requests
2. **Error Rates**: Should be < 1% under normal conditions
3. **Memory Usage**: Should stay below 80% of available memory
4. **Reasoning Token Usage**: Monitor costs and performance impact

### Log Analysis

```bash
# Count errors by type
grep "ERROR" logs/app.log | jq -r '.error.type' | sort | uniq -c

# Monitor reasoning effort decisions
grep "reasoning_effort" logs/app.log | jq -r '.reasoning_effort' | sort | uniq -c

# Track response times
grep "request_completed" logs/app.log | jq -r '.duration_ms' | awk '{sum+=$1; count++} END {print "Average:", sum/count "ms"}'
```

### Health Check Automation

```bash
#!/bin/bash
# health-check.sh
HEALTH_URL="http://localhost:8080/health"
RESPONSE=$(curl -s "$HEALTH_URL")
STATUS=$(echo "$RESPONSE" | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Service unhealthy: $RESPONSE"
  exit 1
else
  echo "✅ Service healthy"
  exit 0
fi
```

## 🆘 Getting Help

### Before Reporting Issues

1. **Check this troubleshooting guide**
2. **Review logs with correlation IDs**
3. **Test with minimal configuration**
4. **Verify Azure OpenAI service status**

### Information to Include

When reporting issues, include:

- **Environment**: OS, Node.js version, pnpm version
- **Configuration**: Sanitized environment variables (no secrets)
- **Error logs**: With correlation IDs and timestamps
- **Request/response examples**: Sanitized of sensitive data
- **Steps to reproduce**: Minimal reproducible example

### Log Collection

```bash
# Collect relevant logs
mkdir debug-logs
cp logs/app.log debug-logs/
curl http://localhost:8080/health > debug-logs/health.json
env | grep -E "(AZURE|PROXY|NODE)" | sed 's/=.*/=[REDACTED]/' > debug-logs/config.txt
```

### Support Channels

1. **GitHub Issues**: For bugs and feature requests
2. **Documentation**: Check docs/ directory for detailed guides
3. **Security Issues**: Report privately via email

Remember: Never include API keys, secrets, or sensitive data in issue reports!