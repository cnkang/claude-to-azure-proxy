# Environment Configuration Guide

This guide explains how to properly configure environment variables for the Claude-to-Azure Proxy while maintaining security best practices.

## 🔒 Security First

**IMPORTANT**: Never commit `.env` files to version control or include them in Docker images!

## Quick Setup

1. **Copy the template**:
   ```bash
   cp .env.example .env
   ```

2. **Edit your `.env` file**:
   ```bash
   # Required Configuration
   PROXY_API_KEY=your-secure-proxy-api-key-here
   AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
   AZURE_OPENAI_API_KEY=your-azure-openai-api-key-here
   AZURE_OPENAI_MODEL=your-model-deployment-name
   ```

3. **Verify security**:
   ```bash
   npm run security:env
   ```

## Environment Variables

## 🚀 Responses API Integration

This proxy now uses Azure OpenAI's v1 Responses API to leverage GPT-5-Codex's enhanced reasoning capabilities. The Responses API provides:

- **Enhanced Reasoning**: Automatic reasoning effort adjustment based on task complexity
- **Better Context**: Improved conversation management with previous_response_id tracking
- **Language Optimization**: Intelligent detection and optimization for different programming languages
- **Structured Outputs**: Support for structured responses and tool usage

### Reasoning Effort Configuration

The proxy automatically analyzes request complexity and adjusts reasoning effort:

- **`minimal`**: Fast responses for simple completions
- **`low`**: Basic reasoning for straightforward tasks
- **`medium`**: Balanced reasoning for most development tasks (default)
- **`high`**: Enhanced reasoning for complex architectural and algorithmic tasks

The system automatically detects:
- Programming language context (Python, Java, TypeScript, React, Vue, etc.)
- Framework patterns (Django, Spring Boot, React hooks, Vue Composition API)
- Task complexity (simple completion vs. complex architecture)
- Multi-turn conversation depth

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PROXY_API_KEY` | API key for authenticating requests to this proxy | `sk-proj-abc123...` |
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI resource endpoint (v1 API) | `https://myresource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `abc123def456...` |
| `AZURE_OPENAI_MODEL` | Azure OpenAI model deployment name (GPT-5-Codex recommended) | `gpt-5-codex` |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Server port | `8080` | `3000` |
| `NODE_ENV` | Node.js environment | `production` | `development` |
| `AZURE_OPENAI_API_VERSION` | API version (only for preview features) | `undefined` | `preview` |
| `AZURE_OPENAI_TIMEOUT` | Request timeout in milliseconds | `60000` | `30000` |
| `AZURE_OPENAI_MAX_RETRIES` | Maximum retry attempts | `3` | `5` |
| `DEFAULT_REASONING_EFFORT` | Default reasoning effort level | `medium` | `high` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `900000` | `600000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` | `50` |
| `CORS_ORIGIN` | CORS allowed origins | `*` | `https://myapp.com` |
| `LOG_LEVEL` | Logging level | `info` | `debug` |

## Security Features

### 🛡️ Protection Mechanisms

1. **Git Protection**: `.gitignore` prevents committing `.env` files
2. **Docker Protection**: `.dockerignore` excludes `.env` from builds
3. **Template System**: `.env.example` provides safe template
4. **Automated Checks**: Security scripts validate configuration

### 🔍 Security Validation

Run security checks:

```bash
# Check environment file security
npm run security:env

# Run all security checks
npm run security:all

# Using Make
make security-check-env
```

## Development vs Production

### Development Setup

```bash
# Copy template
cp .env.example .env

# Edit with development values
nano .env

# Start development server
npm run dev
```

### Production Deployment

**Never use `.env` files in production!** Instead:

#### AWS App Runner
Use environment variables in the App Runner configuration:

```yaml
# apprunner.yaml
env:
  - name: PROXY_API_KEY
    value: your-proxy-key
  - name: AZURE_OPENAI_ENDPOINT
    value: https://your-resource.openai.azure.com
```

#### Docker Production
Pass environment variables at runtime:

```bash
docker run --init -e PROXY_API_KEY=xxx -e AZURE_OPENAI_ENDPOINT=xxx claude-to-azure-proxy
```

#### AWS Secrets Manager
Use AWS Secrets Manager for sensitive values:

```javascript
// Example: Loading from AWS Secrets Manager
const secret = await secretsManager.getSecretValue({
  SecretId: 'claude-proxy-secrets'
}).promise();
```

## Common Issues

### ❌ `.env` file committed to git

```bash
# Remove from git (keep local file)
git rm --cached .env

# Add to .gitignore if not already there
echo ".env" >> .gitignore

# Commit the removal
git commit -m "Remove .env file from git"
```

### ❌ `.env` file in Docker image

```bash
# Check if .env is in .dockerignore
grep "\.env" .dockerignore

# If not, add it
echo ".env" >> .dockerignore
```

### ❌ Missing environment variables

```bash
# Check required variables
node -e "
const required = ['PROXY_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_MODEL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.log('Missing required environment variables:', missing);
  process.exit(1);
} else {
  console.log('All required environment variables are set');
}
"
```

## Best Practices

### ✅ Do's

- Use `.env.example` as a template
- Keep `.env` files local to your development environment
- Use strong, unique API keys
- Rotate secrets regularly
- Use environment-specific configurations
- Validate environment variables on startup
- Use secrets management in production

### ❌ Don'ts

- Never commit `.env` files to version control
- Don't include `.env` files in Docker images
- Don't use production secrets in development
- Don't share `.env` files via email or chat
- Don't use weak or default API keys
- Don't hardcode secrets in source code

## Troubleshooting

### Check Configuration

```bash
# Verify .env file exists and is readable
ls -la .env

# Check environment variables are loaded
node -e "console.log(process.env.PROXY_API_KEY ? 'API key loaded' : 'API key missing')"

# Run security validation
npm run security:env
```

### Debug Environment Loading

```bash
# Check if dotenv is working
node -e "
require('dotenv').config();
console.log('Environment loaded:', {
  hasProxyKey: !!process.env.PROXY_API_KEY,
  hasAzureEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
  nodeEnv: process.env.NODE_ENV
});
"
```

## Support

For environment configuration issues:

1. Run `npm run security:env` to check configuration
2. Verify `.env.example` matches your setup
3. Check the troubleshooting section above
4. Review the main documentation
5. Check GitHub Issues for known problems

Remember: **Security first!** Always validate your environment configuration before deploying.