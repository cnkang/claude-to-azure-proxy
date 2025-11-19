# Configuration Guide

Complete configuration reference for the Claude-to-Azure Proxy with Node.js 24 LTS optimizations.

## 🔧 Environment Variables

### Required Configuration

| Variable                | Description                             | Example                                  |
| ----------------------- | --------------------------------------- | ---------------------------------------- |
| `PROXY_API_KEY`         | Secure API key for proxy authentication | `your-secure-32-character-key`           |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint          | `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY`  | Azure OpenAI API key                    | `your-azure-api-key`                     |
| `AZURE_OPENAI_MODEL`    | Default model deployment name           | `gpt-4o`                                 |

### Optional Configuration

| Variable     | Default       | Description                              |
| ------------ | ------------- | ---------------------------------------- |
| `PORT`       | `8080`        | Server port                              |
| `NODE_ENV`   | `development` | Environment mode                         |
| `LOG_LEVEL`  | `info`        | Logging level (debug, info, warn, error) |
| `LOG_FORMAT` | `pretty`      | Log format (pretty, json)                |

### Azure OpenAI Settings

| Variable                       | Default     | Description                                           |
| ------------------------------ | ----------- | ----------------------------------------------------- |
| ~~`AZURE_OPENAI_API_VERSION`~~ | ~~Removed~~ | ~~API version (deprecated - automatically handled)~~  |
| `AZURE_OPENAI_TIMEOUT`         | `120000`    | Request timeout (ms)                                  |
| `AZURE_OPENAI_MAX_RETRIES`     | `3`         | Max retry attempts                                    |
| `DEFAULT_REASONING_EFFORT`     | `medium`    | Default reasoning effort (minimal, low, medium, high) |

### AWS Bedrock Settings (Optional)

| Variable                  | Default     | Description                               |
| ------------------------- | ----------- | ----------------------------------------- |
| `AWS_BEDROCK_API_KEY`     | -           | AWS Bedrock API key (enables Qwen models) |
| `AWS_BEDROCK_REGION`      | `us-west-2` | AWS region for Bedrock service            |
| `AWS_BEDROCK_TIMEOUT`     | `120000`    | Request timeout (ms)                      |
| `AWS_BEDROCK_MAX_RETRIES` | `3`         | Max retry attempts                        |

**Note**: AWS Bedrock configuration is optional. When configured, it enables support for Qwen models
(qwen-3-coder, qwen.qwen3-coder-480b-a35b-v1:0) alongside existing Azure OpenAI models.

### Security Settings

| Variable                             | Default  | Description                        |
| ------------------------------------ | -------- | ---------------------------------- |
| `ENABLE_CONTENT_SECURITY_VALIDATION` | `true`   | Enable content security validation |
| `CORS_ORIGIN`                        | `*`      | CORS allowed origins               |
| `RATE_LIMIT_WINDOW_MS`               | `900000` | Rate limit window (15 min)         |
| `RATE_LIMIT_MAX_REQUESTS`            | `100`    | Max requests per window            |

### Performance Settings

| Variable                        | Default   | Description                       |
| ------------------------------- | --------- | --------------------------------- |
| `MAX_CONCURRENT_REQUESTS`       | `50`      | Max concurrent requests           |
| `CONVERSATION_MAX_AGE`          | `3600000` | Conversation cleanup age (1 hour) |
| `CONVERSATION_CLEANUP_INTERVAL` | `300000`  | Cleanup interval (5 min)          |

## 🎯 Model Routing Configuration

The proxy automatically routes requests to the appropriate AI service based on the model parameter
in the request:

### Supported Models and Routing

| Model Name                        | Service      | Description                       |
| --------------------------------- | ------------ | --------------------------------- |
| `qwen-3-coder`                    | AWS Bedrock  | Qwen 3 Coder (user-friendly name) |
| `qwen.qwen3-coder-480b-a35b-v1:0` | AWS Bedrock  | Qwen 3 Coder (full AWS model ID)  |
| `gpt-5-codex`                     | Azure OpenAI | GPT-5 Codex deployment            |
| `gpt-4`                           | Azure OpenAI | GPT-4 models                      |
| `claude-3-5-sonnet-20241022`      | Azure OpenAI | Claude models (via Azure)         |
| Other models                      | Azure OpenAI | Default fallback                  |

### Model Routing Logic

The proxy automatically determines the target service based on the `model` parameter in the request:

1. **Qwen Models → AWS Bedrock**:
   - `qwen-3-coder` (user-friendly name)
   - `qwen.qwen3-coder-480b-a35b-v1:0` (full AWS model ID)
   - Any model containing `qwen` in the name
   - **Requirement**: `AWS_BEDROCK_API_KEY` must be configured

2. **Azure Models → Azure OpenAI**:
   - `gpt-5-codex` (GPT-5 Codex deployment)
   - `gpt-4`, `gpt-3.5-turbo` (GPT models)
   - `claude-3-5-sonnet-20241022` (Claude models via Azure)
   - Any model containing `gpt` or `claude` in the name

3. **Default Fallback → Azure OpenAI**:
   - Unrecognized model names default to Azure OpenAI
   - Ensures backward compatibility with existing clients

4. **Error Handling**:
   - Unsupported models return HTTP 400 with clear error messages
   - Error responses include list of available model alternatives
   - AWS Bedrock models only available when properly configured

### Model Configuration Requirements

- **AWS Bedrock Models**: Require `AWS_BEDROCK_API_KEY` to be configured
- **Azure OpenAI Models**: Require standard Azure OpenAI configuration
- **Mixed Usage**: Both services can be configured simultaneously for maximum flexibility

### Example Model Requests

```bash
# Route to AWS Bedrock (Qwen model)
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen-3-coder", "messages": [...]}'

# Route to Azure OpenAI (GPT model)
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5-codex", "messages": [...]}'
```

## 📝 Configuration Files

### .env File

```bash
# Core Configuration
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=gpt-5-codex

# Optional AWS Bedrock Configuration (enables Qwen models)
AWS_BEDROCK_API_KEY=your-aws-bedrock-api-key
AWS_BEDROCK_REGION=us-west-2
AWS_BEDROCK_TIMEOUT=120000
AWS_BEDROCK_MAX_RETRIES=3

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

# Check optional AWS Bedrock configuration
node -e "
const bedrock = ['AWS_BEDROCK_API_KEY', 'AWS_BEDROCK_REGION'];
const bedrockSet = bedrock.filter(key => process.env[key]);
if (bedrockSet.length > 0 && bedrockSet.length < bedrock.length) {
  console.log('⚠️  Partial Bedrock config: ' + bedrock.filter(key => !process.env[key]).join(', ') + ' missing');
} else if (bedrockSet.length === bedrock.length) {
  console.log('✅ AWS Bedrock configuration complete');
} else {
  console.log('ℹ️  AWS Bedrock not configured (optional)');
}
"

# Test Azure OpenAI connectivity
curl -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
     "$AZURE_OPENAI_ENDPOINT/openai/v1/models"

# Test AWS Bedrock connectivity (if configured)
if [ -n "$AWS_BEDROCK_API_KEY" ]; then
  echo "Testing AWS Bedrock connectivity..."
  curl -X POST "https://bedrock-runtime.$AWS_BEDROCK_REGION.amazonaws.com/model/qwen.qwen3-coder-480b-a35b-v1:0/converse" \
       -H "Authorization: Bearer $AWS_BEDROCK_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{"messages":[{"role":"user","content":[{"text":"test"}]}],"inferenceConfig":{"maxTokens":10}}'
fi
```

## 🏗️ Platform-Specific Configuration

### AWS App Runner

```yaml
# apprunner.yaml
version: 1.0
runtime: nodejs24
build:
  commands:
    build:
      - corepack enable && corepack prepare pnpm@10.19.0 --activate
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
  NODE_ENV: 'production'
  PORT: '8080'
  LOG_LEVEL: 'info'
  DEFAULT_REASONING_EFFORT: 'medium'
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

## 🔧 AWS Bedrock Configuration Validation

### Startup Validation

The proxy performs fail-fast validation of AWS Bedrock configuration at startup:

```bash
# Valid configuration example
AWS_BEDROCK_API_KEY=your-bedrock-api-key-here
AWS_BEDROCK_REGION=us-west-2
AWS_BEDROCK_TIMEOUT=120000
AWS_BEDROCK_MAX_RETRIES=3

# Start server - will validate configuration
pnpm start
```

**Validation Checks**:

- ✅ API key format and length validation
- ✅ Region format validation (must be valid AWS region)
- ✅ Timeout value validation (must be positive integer)
- ✅ Max retries validation (must be positive integer ≤ 10)
- ✅ Network connectivity test to AWS Bedrock endpoint

### Configuration Testing

```bash
# Test AWS Bedrock connectivity manually
curl -X POST "https://bedrock-runtime.us-west-2.amazonaws.com/model/qwen.qwen3-coder-480b-a35b-v1:0/converse" \
     -H "Authorization: Bearer $AWS_BEDROCK_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "messages": [{"role": "user", "content": [{"text": "Hello"}]}],
       "inferenceConfig": {"maxTokens": 10}
     }'

# Test model routing through proxy
curl -X POST "http://localhost:8080/v1/messages" \
     -H "Authorization: Bearer $PROXY_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "qwen-3-coder",
       "messages": [{"role": "user", "content": "Test message"}],
       "max_tokens": 10
     }'
```

### Health Check Validation

When AWS Bedrock is configured, the health endpoint includes Bedrock status:

```bash
curl http://localhost:8080/health

# Expected response with Bedrock configured:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "azure": "healthy",
    "bedrock": "healthy"
  },
  "models": {
    "azure": ["gpt-5-codex", "claude-3-5-sonnet-20241022"],
    "bedrock": ["qwen-3-coder", "qwen.qwen3-coder-480b-a35b-v1:0"]
  }
}
```

### Troubleshooting Configuration Issues

**Common Configuration Problems**:

1. **Invalid API Key Format**:

   ```
   Error: AWS_BEDROCK_API_KEY must be a valid API key format
   Solution: Ensure API key is properly formatted and has correct permissions
   ```

2. **Region Mismatch**:

   ```
   Error: Model qwen.qwen3-coder-480b-a35b-v1:0 not available in region us-east-1
   Solution: Set AWS_BEDROCK_REGION=us-west-2 (Qwen models are in us-west-2)
   ```

3. **Network Connectivity**:

   ```
   Error: Unable to connect to AWS Bedrock endpoint
   Solution: Check network connectivity and firewall rules for HTTPS to *.amazonaws.com
   ```

4. **Partial Configuration**:
   ```
   Warning: AWS_BEDROCK_API_KEY set but AWS_BEDROCK_REGION missing
   Solution: Set both AWS_BEDROCK_API_KEY and AWS_BEDROCK_REGION for Bedrock support
   ```

## 🔧 Advanced Configuration

### Node.js 24 Options

```bash
# Node.js 24 optimized memory settings
export NODE_OPTIONS="--max-old-space-size=1024 --max-semi-space-size=128 --optimize-for-size --gc-interval=100 --incremental-marking --concurrent-marking --parallel-scavenge"

# High-performance settings for heavy loads
export NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=256 --optimize-for-size --gc-interval=50 --incremental-marking --concurrent-marking --parallel-scavenge --expose-gc"

# Performance profiling with Node.js 24 features
export NODE_OPTIONS="--prof --prof-process --heap-prof --cpu-prof"

# Debug mode with enhanced Node.js 24 debugging
export NODE_OPTIONS="--inspect=0.0.0.0:9229 --enable-source-maps"

# Memory leak detection (Node.js 24)
export NODE_OPTIONS="--expose-gc --heap-prof --heap-prof-interval=10000"
```

### Node.js 24 Performance Settings

| Setting                 | Description                           | Recommended Value                         |
| ----------------------- | ------------------------------------- | ----------------------------------------- |
| `--max-old-space-size`  | Maximum old generation heap size (MB) | `1024` (standard), `2048` (high-load)     |
| `--max-semi-space-size` | Maximum new generation heap size (MB) | `128` (standard), `256` (high-load)       |
| `--optimize-for-size`   | Optimize for memory usage over speed  | Always enabled                            |
| `--gc-interval`         | Garbage collection interval           | `100` (standard), `50` (high-performance) |
| `--incremental-marking` | Enable incremental GC marking         | Always enabled                            |
| `--concurrent-marking`  | Enable concurrent GC marking          | Always enabled                            |
| `--parallel-scavenge`   | Enable parallel scavenging            | Always enabled                            |
| `--expose-gc`           | Expose global.gc() function           | Production monitoring only                |

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
# API version is automatically handled - no configuration needed
# The latest stable Azure OpenAI API (v1) is used by default
```

**Memory issues:**

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable garbage collection
export NODE_OPTIONS="--gc-interval=100"
```

For more troubleshooting, see the [Troubleshooting Guide](./TROUBLESHOOTING.md).
