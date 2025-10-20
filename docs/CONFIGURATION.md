# Configuration Guide

Complete configuration reference for the Claude-to-Azure Proxy.

## 🔧 Environment Variables

### Required Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `PROXY_API_KEY` | Secure API key for proxy authentication | `your-secure-32-character-key` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint | `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `your-azure-api-key` |
| `AZURE_OPENAI_MODEL` | Default model deployment name | `gpt-4o` |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `LOG_FORMAT` | `pretty` | Log format (pretty, json) |

### Azure OpenAI Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_OPENAI_API_VERSION` | `2024-10-21` | API version (leave unset for GA) |
| `AZURE_OPENAI_TIMEOUT` | `120000` | Request timeout (ms) |
| `AZURE_OPENAI_MAX_RETRIES` | `3` | Max retry attempts |
| `DEFAULT_REASONING_EFFORT` | `medium` | Default reasoning effort (minimal, low, medium, high) |

### Security Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CONTENT_SECURITY_VALIDATION` | `true` | Enable content security validation |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |

### Performance Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_REQUESTS` | `50` | Max concurrent requests |
| `CONVERSATION_MAX_AGE` | `3600000` | Conversation cleanup age (1 hour) |
| `CONVERSATION_CLEANUP_INTERVAL` | `300000` | Cleanup interval (5 min) |

## 📝 Configuration Files

### .env File
```bash
# Core Configuration
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=gpt-4o

# Optional Settings
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
DEFAULT_REASONING_EFFORT=medium

# Security (disable for code review/development)
ENABLE_CONTENT_SECURITY_VALIDATION=false
```

### Docker Compose Override
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  claude-proxy:
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
      - ENABLE_CONTENT_SECURITY_VALIDATION=false
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

## 🔐 Security Configuration

### API Key Generation
```bash
# Generate secure proxy API key
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Content Security
For development/code review, disable content security validation:
```bash
export ENABLE_CONTENT_SECURITY_VALIDATION=false
```

For production with untrusted input, keep it enabled (default).

### CORS Configuration
```bash
# Allow specific origins
export CORS_ORIGIN="https://yourdomain.com,https://app.yourdomain.com"

# Allow all origins (development only)
export CORS_ORIGIN="*"
```

## 🎯 Environment-Specific Configs

### Development
```bash
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty
ENABLE_CONTENT_SECURITY_VALIDATION=false
```

### Production
```bash
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_CONTENT_SECURITY_VALIDATION=true
CORS_ORIGIN=https://yourdomain.com
```

### Testing
```bash
NODE_ENV=test
LOG_LEVEL=warn
AZURE_OPENAI_TIMEOUT=30000
MAX_CONCURRENT_REQUESTS=10
```

## 🔄 Configuration Validation

### Automatic Validation
```bash
# Validate configuration
pnpm run validate:config

# Check environment security
pnpm run security:env
```

### Manual Validation
```bash
# Check required variables
node -e "
const required = ['PROXY_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_MODEL'];
const missing = required.filter(key => !process.env[key]);
console.log(missing.length ? '❌ Missing: ' + missing.join(', ') : '✅ All required variables set');
"

# Test Azure OpenAI connectivity
curl -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
     "$AZURE_OPENAI_ENDPOINT/openai/v1/models"
```

## 🏗️ Platform-Specific Configuration

### AWS App Runner
```yaml
# apprunner.yaml
version: 1.0
runtime: nodejs22
build:
  commands:
    build:
      - corepack enable && corepack prepare pnpm@10.18.3 --activate
      - pnpm install --frozen-lockfile
      - pnpm run build
run:
  runtime-version: 22
  command: node dist/index.js
  network:
    port: 8080
    env: PORT
  env:
    - name: NODE_ENV
      value: production
```

### Kubernetes
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-proxy-config
data:
  NODE_ENV: "production"
  PORT: "8080"
  LOG_LEVEL: "info"
  DEFAULT_REASONING_EFFORT: "medium"
```

### Docker Swarm
```yaml
# docker-stack.yml
version: '3.8'
services:
  claude-proxy:
    image: claude-proxy:latest
    environment:
      - NODE_ENV=production
      - PORT=8080
    secrets:
      - proxy_api_key
      - azure_api_key
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
```

## 📊 Monitoring Configuration

### Prometheus Metrics
```bash
# Enable metrics endpoint
export ENABLE_METRICS=true

# Custom metrics port
export METRICS_PORT=9090
```

### Health Check Configuration
```bash
# Health check timeout
export HEALTH_CHECK_TIMEOUT=5000

# Memory threshold for health check
export MEMORY_THRESHOLD=85
```

## 🔧 Advanced Configuration

### Node.js Options
```bash
# Memory optimization
export NODE_OPTIONS="--max-old-space-size=2048 --gc-interval=100"

# Performance profiling
export NODE_OPTIONS="--prof --prof-process"

# Debug mode
export NODE_OPTIONS="--inspect=0.0.0.0:9229"
```

### Logging Configuration
```bash
# Structured JSON logging
export LOG_FORMAT=json
export LOG_LEVEL=info

# Pretty console logging (development)
export LOG_FORMAT=pretty
export LOG_LEVEL=debug

# Log file output
export LOG_FILE=logs/app.log
```

## 🚨 Troubleshooting Configuration

### Common Issues

**Invalid endpoint format:**
```bash
# Correct format (must end with /openai/v1/)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# Incorrect formats
❌ https://your-resource.openai.azure.com/
❌ https://your-resource.openai.azure.com/openai/v1/
```

**API version conflicts:**
```bash
# For GA API, don't set version
unset AZURE_OPENAI_API_VERSION

# For preview features only
export AZURE_OPENAI_API_VERSION=preview
```

**Memory issues:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable garbage collection
export NODE_OPTIONS="--gc-interval=100"
```

For more troubleshooting, see the [Troubleshooting Guide](./TROUBLESHOOTING.md).