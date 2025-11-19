# Quick Start Guide

Get the Claude-to-Azure Proxy running in 5 minutes.

## 🚀 Prerequisites

- **Node.js** 24+ and **pnpm** 10.19+
- **Docker** (for containerized deployment)
- **Azure OpenAI** resource with API access

## ⚡ 5-Minute Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd claude-to-azure-proxy
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Azure OpenAI details
```

Required variables:

```bash
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=your-model-deployment-name
```

### 3. Start the Service

```bash
# Development
pnpm dev

# Production
pnpm start

# Docker (recommended)
docker compose up -d
```

### 4. Test the Service

```bash
# Health check
curl http://localhost:8080/health

# Test Claude API format
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer your-proxy-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 🎯 What's Next?

- **Production deployment** → [Deployment Guide](./DEPLOYMENT.md)
- **Detailed configuration** → [Configuration Guide](./CONFIGURATION.md)
- **Issues?** → [Troubleshooting Guide](./TROUBLESHOOTING.md)

## 🔧 Common Quick Fixes

### Service won't start?

```bash
# Check configuration
pnpm run validate:config

# Check logs
docker compose logs -f
```

### Authentication failing?

```bash
# Verify API key length (should be 32+ characters)
echo "PROXY_API_KEY length: ${#PROXY_API_KEY}"

# Test Azure OpenAI connectivity
curl -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
     "$AZURE_OPENAI_ENDPOINT/openai/v1/models"
```

### Memory issues?

```bash
# Apply memory optimizations
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose down && docker compose up -d
```
