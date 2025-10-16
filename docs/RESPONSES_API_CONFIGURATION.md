# Azure OpenAI v1 Responses API Configuration Guide

This guide explains how to configure the Claude-to-Azure Proxy to use Azure OpenAI's v1 Responses API with GPT-5-Codex for enhanced reasoning capabilities.

## 🚀 Overview

The Responses API provides several advantages over the Chat Completions API:

- **Enhanced Reasoning**: GPT-5-Codex can apply internal reasoning for complex tasks
- **Better Context Management**: Improved conversation tracking with `previous_response_id`
- **Structured Outputs**: Support for JSON schemas and structured responses
- **Tool Usage**: Enhanced function calling capabilities
- **Language Optimization**: Automatic adjustments for different programming languages

## 📋 API Version Selection

Azure OpenAI offers two versions of the Responses API:

### ✅ GA v1 API (Recommended)
- **Status**: Generally Available (Production Ready)
- **Configuration**: Leave `AZURE_OPENAI_API_VERSION` empty or undefined
- **Endpoint**: Uses `/openai/v1/` path
- **Benefits**: Stable, production-ready, no api-version parameter needed

### 🔄 Legacy Preview API
- **Status**: Preview (Legacy)
- **Configuration**: Set `AZURE_OPENAI_API_VERSION=preview`
- **Endpoint**: Uses legacy Azure OpenAI endpoints
- **Use Case**: Only if you need specific preview features not yet in GA

**Recommendation**: Use the GA v1 API unless you specifically need preview features.

## 🔧 Basic Configuration

### Required Environment Variables

```bash
# Core Azure OpenAI v1 Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=gpt-5-codex  # Or your GPT-5-Codex deployment name

# Proxy Authentication
PROXY_API_KEY=your-secure-proxy-api-key-32-chars-min
```

### Optional Configuration

```bash
# API Version (for legacy preview API only)
# AZURE_OPENAI_API_VERSION=preview  # Only set for legacy preview API (leave empty for GA v1)

# Timeout and Retry Configuration
AZURE_OPENAI_TIMEOUT=60000          # 60 seconds (default)
AZURE_OPENAI_MAX_RETRIES=3          # 3 retries (default)

# Reasoning Configuration
DEFAULT_REASONING_EFFORT=medium      # minimal|low|medium|high (default: medium)

# Server Configuration
PORT=8080                           # Server port (default: 8080)
NODE_ENV=production                 # Environment (default: production)
```

## 🧠 Reasoning Effort Configuration

### Understanding Reasoning Levels

The proxy automatically analyzes request complexity and applies appropriate reasoning effort:

| Level | Use Case | Response Time | Quality | Token Usage |
|-------|----------|---------------|---------|-------------|
| `minimal` | Simple completions, basic questions | Fastest | Basic | Lowest |
| `low` | Straightforward coding tasks | Fast | Good | Low |
| `medium` | Most development tasks | Moderate | High | Moderate |
| `high` | Complex architecture, algorithms | Slower | Highest | Highest |

### Automatic Detection

The system automatically detects complexity based on:

#### Content Analysis
- **Length**: Longer requests may need more reasoning
- **Code blocks**: Multiple code blocks indicate complexity
- **Keywords**: Architectural, algorithmic, debugging keywords
- **Context**: Multi-turn conversation depth

#### Language-Specific Detection
- **Python**: Django, FastAPI, data science patterns
- **Java**: Spring Boot, Spring Cloud, enterprise patterns
- **TypeScript**: React, Vue, Node.js patterns
- **Kotlin**: Android SDK, mobile development
- **Shell**: DevOps, automation, system administration

#### Framework-Specific Optimization
- **Django**: ORM patterns, middleware, authentication
- **Spring Boot**: Microservices, configuration, security
- **React**: Hooks, component architecture, state management
- **Vue**: Composition API, reactive patterns
- **Android**: SDK patterns, lifecycle management

### Manual Override

You can override automatic detection in requests:

#### Claude Format
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1000,
  "messages": [
    {
      "role": "user",
      "content": "Design a microservices architecture for an e-commerce platform"
    }
  ],
  "reasoning": {
    "effort": "high"
  }
}
```

#### OpenAI Format
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Write a simple hello world function"
    }
  ],
  "reasoning": {
    "effort": "minimal"
  }
}
```

## 🔄 Conversation Management

### Multi-Turn Conversations

The Responses API supports improved conversation management:

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1000,
  "messages": [
    {
      "role": "user",
      "content": "Create a React component"
    }
  ],
  "conversation_id": "conv_123",
  "previous_response_id": "resp_456"
}
```

### Configuration Options

```bash
# Conversation management settings
CONVERSATION_MAX_AGE=3600000        # 1 hour in milliseconds
CONVERSATION_CLEANUP_INTERVAL=300000 # 5 minutes in milliseconds
MAX_STORED_CONVERSATIONS=1000       # Maximum conversations to keep in memory
```

## 🌐 Multi-Format Support

### Request Format Detection

The proxy automatically detects request format and responds accordingly:

#### Claude Format Detection
- Presence of `anthropic-version` header
- `system` parameter in request body
- Content blocks with `type` field
- Claude-specific message structure

#### OpenAI Format Detection
- Simple string content in messages
- Standard OpenAI roles (system, user, assistant, tool)
- OpenAI-specific parameters

### Response Format Matching

Responses always match the request format:
- Claude requests → Claude responses
- OpenAI requests → OpenAI responses

## 🔒 Security Configuration

### API Key Management

```bash
# Strong API keys (32+ characters recommended)
PROXY_API_KEY=$(openssl rand -base64 32)
AZURE_OPENAI_API_KEY=your-azure-key-from-portal

# Never log sensitive data
LOG_SANITIZE_KEYS=true  # Default: true
```

### Rate Limiting

```bash
# Rate limiting configuration
RATE_LIMIT_WINDOW_MS=900000         # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100         # 100 requests per window
RATE_LIMIT_SKIP_FAILED_REQUESTS=true # Don't count failed requests
```

### Input Validation

```bash
# Request validation settings
MAX_REQUEST_SIZE=1048576            # 1MB maximum request size
MAX_TOKENS=8192                     # Maximum tokens per request
VALIDATE_JSON_SCHEMA=true           # Validate structured outputs
```

## 📊 Monitoring Configuration

### Logging

```bash
# Logging configuration
LOG_LEVEL=info                      # debug|info|warn|error
LOG_FORMAT=json                     # json|text
LOG_CORRELATION_ID=true             # Include correlation IDs
LOG_PERFORMANCE_METRICS=true        # Log performance data
```

### Metrics Collection

```bash
# Metrics configuration
ENABLE_METRICS=true                 # Enable metrics collection
METRICS_PORT=9090                   # Prometheus metrics port
TRACK_REASONING_TOKENS=true         # Track reasoning token usage
TRACK_LANGUAGE_DETECTION=true       # Track language detection accuracy
```

### Health Checks

```bash
# Health check configuration
HEALTH_CHECK_TIMEOUT=5000           # 5 seconds
HEALTH_CHECK_AZURE_CONNECTIVITY=true # Test Azure OpenAI connectivity
HEALTH_CHECK_MEMORY_THRESHOLD=0.9   # Alert at 90% memory usage
```

## 🚀 Performance Optimization

### Timeout Configuration

```bash
# Timeout settings for different reasoning levels
TIMEOUT_MINIMAL=10000               # 10 seconds for minimal reasoning
TIMEOUT_LOW=20000                   # 20 seconds for low reasoning
TIMEOUT_MEDIUM=60000                # 60 seconds for medium reasoning (default)
TIMEOUT_HIGH=120000                 # 120 seconds for high reasoning
```

### Connection Pooling

```bash
# HTTP client configuration
HTTP_KEEP_ALIVE=true                # Enable keep-alive connections
HTTP_MAX_SOCKETS=50                 # Maximum concurrent connections
HTTP_TIMEOUT=60000                  # Connection timeout
```

### Memory Management

```bash
# Node.js memory configuration
NODE_OPTIONS="--max-old-space-size=2048 --gc-interval=100"

# Conversation cleanup
CONVERSATION_MEMORY_LIMIT=100       # MB limit for conversation storage
CLEANUP_ON_MEMORY_PRESSURE=true    # Clean up on high memory usage
```

## 🔧 Development vs Production

### Development Configuration

```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=text
DEFAULT_REASONING_EFFORT=low        # Faster responses for development
AZURE_OPENAI_TIMEOUT=30000          # Shorter timeout for development
ENABLE_PROFILING=true               # Enable performance profiling
```

### Production Configuration

```bash
# Production environment variables (set in deployment)
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json
DEFAULT_REASONING_EFFORT=medium
AZURE_OPENAI_TIMEOUT=60000
ENABLE_METRICS=true
HEALTH_CHECK_AZURE_CONNECTIVITY=true
```

## 🧪 Testing Configuration

### Test Environment

```bash
# .env.test
NODE_ENV=test
LOG_LEVEL=error                     # Minimal logging during tests
AZURE_OPENAI_TIMEOUT=10000          # Fast timeout for tests
DEFAULT_REASONING_EFFORT=minimal    # Fast responses for tests
DISABLE_RATE_LIMITING=true          # No rate limiting in tests
```

### Mock Configuration

```bash
# Use mock Azure OpenAI for testing
MOCK_AZURE_OPENAI=true              # Enable mocking
MOCK_RESPONSE_DELAY=100             # Simulate network delay
MOCK_REASONING_TOKENS=true          # Mock reasoning token usage
```

## 📋 Configuration Validation

### Startup Validation

The proxy validates configuration on startup:

```bash
# Run configuration validation
pnpm run validate:config

# Check specific configuration sections
pnpm run validate:azure-config
pnpm run validate:reasoning-config
pnpm run validate:security-config
```

### Runtime Validation

```bash
# Test configuration with health check
curl http://localhost:8080/health

# Validate Azure OpenAI connectivity
curl http://localhost:8080/health/azure

# Check reasoning configuration
curl http://localhost:8080/health/reasoning
```

## 🔄 Configuration Updates

### Hot Reload

Some configuration can be updated without restart:

```bash
# Update reasoning configuration
curl -X POST http://localhost:8080/admin/config/reasoning \
  -H "Authorization: Bearer admin-key" \
  -d '{"DEFAULT_REASONING_EFFORT": "high"}'

# Update rate limiting
curl -X POST http://localhost:8080/admin/config/rate-limit \
  -H "Authorization: Bearer admin-key" \
  -d '{"RATE_LIMIT_MAX_REQUESTS": 200}'
```

### Configuration History

```bash
# View configuration changes
curl http://localhost:8080/admin/config/history \
  -H "Authorization: Bearer admin-key"
```

## 🆘 Troubleshooting Configuration

### Common Issues

1. **Invalid API Version**: Don't set `AZURE_OPENAI_API_VERSION` for GA v1 API
2. **Wrong Endpoint Format**: Ensure endpoint ends with `/openai/v1/`
3. **Timeout Too Low**: Increase timeout for high reasoning effort
4. **Memory Issues**: Adjust conversation cleanup settings

### Validation Commands

```bash
# Test Azure OpenAI connectivity
curl -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
     "$AZURE_OPENAI_ENDPOINT/models"

# Validate reasoning configuration
node -e "
const config = require('./dist/config/index.js').default;
console.log('Reasoning config:', {
  defaultEffort: config.DEFAULT_REASONING_EFFORT,
  timeout: config.AZURE_OPENAI_TIMEOUT,
  maxRetries: config.AZURE_OPENAI_MAX_RETRIES
});
"
```

For more troubleshooting help, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).