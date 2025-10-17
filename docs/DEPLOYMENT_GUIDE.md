# Deployment Guide - Claude-to-Azure Proxy with Responses API

This comprehensive guide covers deploying the Claude-to-Azure Proxy with Azure OpenAI v1 Responses API integration across different environments.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22.0.0 or higher
- **pnpm** 10.18.1 or higher
- **Docker** (for containerized deployment)
- **Azure OpenAI** resource with v1 API access
- **GPT-5-Codex** deployment (recommended for best results)

### Environment Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd claude-to-azure-proxy
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Validate configuration**:
   ```bash
   pnpm run validate:config
   ```

4. **Run health check**:
   ```bash
   pnpm run health-check
   ```

## 🔧 Configuration

### Required Environment Variables

```bash
# Core Configuration
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=gpt-5-codex  # Your GPT-5-Codex deployment name

# Responses API Configuration (Optional)
# AZURE_OPENAI_API_VERSION=preview  # Only for preview features
AZURE_OPENAI_TIMEOUT=120000
AZURE_OPENAI_MAX_RETRIES=3
DEFAULT_REASONING_EFFORT=medium

# Server Configuration (Optional)
PORT=8080
NODE_ENV=production
```

### Security Configuration

```bash
# Generate secure API key
PROXY_API_KEY=$(openssl rand -base64 32)

# Validate configuration
pnpm run security:env
```

## 🐳 Docker Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Deploy with Docker Compose
pnpm run deploy:docker-compose

# Or manually
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f claude-proxy
```

### Option 2: Standalone Docker

```bash
# Build and deploy
pnpm run deploy:docker

# Or manually
docker build -t claude-proxy:latest .
docker run -d \
  --name claude-proxy \
  --init \
  -p 8080:8080 \
  --env-file .env \
  --restart unless-stopped \
  claude-proxy:latest
```

### Docker Health Checks

```bash
# Check container health
docker ps
docker logs claude-proxy

# Run health check
curl http://localhost:8080/health
```

## ☁️ AWS App Runner Deployment

### Prerequisites

- AWS CLI configured
- App Runner service IAM role
- Environment variables configured in AWS

### Deployment Steps

1. **Prepare configuration**:
   ```bash
   # Use the provided apprunner.yaml
   cat apprunner.yaml
   ```

2. **Deploy via AWS Console**:
   - Go to AWS App Runner console
   - Create new service
   - Choose "Source code repository" or "Container image"
   - Upload your code or specify container image
   - Configure environment variables
   - Use `apprunner.yaml` for build settings

3. **Deploy via AWS CLI**:
   ```bash
   # Create App Runner service (example)
   aws apprunner create-service \
     --service-name claude-proxy \
     --source-configuration file://apprunner-config.json
   ```

### App Runner Configuration

```yaml
# apprunner.yaml
version: 1.0
runtime: nodejs22
build:
  commands:
    build:
      - corepack enable
      - corepack prepare pnpm@10.18.1 --activate
      - pnpm install --frozen-lockfile --ignore-scripts
      - pnpm run build
      - pnpm prune --prod
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

## 🎯 Kubernetes Deployment

### Prerequisites

- Kubernetes cluster
- kubectl configured
- Container registry access

### Deployment Files

1. **Create namespace**:
   ```yaml
   # namespace.yaml
   apiVersion: v1
   kind: Namespace
   metadata:
     name: claude-proxy
   ```

2. **Create secret**:
   ```yaml
   # secret.yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: claude-proxy-secrets
     namespace: claude-proxy
   type: Opaque
   stringData:
     PROXY_API_KEY: "your-proxy-api-key"
     AZURE_OPENAI_API_KEY: "your-azure-api-key"
   ```

3. **Create deployment**:
   ```yaml
   # deployment.yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: claude-proxy
     namespace: claude-proxy
   spec:
     replicas: 3
     selector:
       matchLabels:
         app: claude-proxy
     template:
       metadata:
         labels:
           app: claude-proxy
       spec:
         containers:
         - name: claude-proxy
           image: claude-proxy:latest
           ports:
           - containerPort: 8080
           env:
           - name: NODE_ENV
             value: "production"
           - name: PORT
             value: "8080"
           - name: AZURE_OPENAI_ENDPOINT
             value: "https://your-resource.openai.azure.com"
           - name: AZURE_OPENAI_MODEL
             value: "gpt-5-codex"
           - name: PROXY_API_KEY
             valueFrom:
               secretKeyRef:
                 name: claude-proxy-secrets
                 key: PROXY_API_KEY
           - name: AZURE_OPENAI_API_KEY
             valueFrom:
               secretKeyRef:
                 name: claude-proxy-secrets
                 key: AZURE_OPENAI_API_KEY
           livenessProbe:
             httpGet:
               path: /health
               port: 8080
             initialDelaySeconds: 30
             periodSeconds: 10
           readinessProbe:
             httpGet:
               path: /health
               port: 8080
             initialDelaySeconds: 5
             periodSeconds: 5
   ```

4. **Create service**:
   ```yaml
   # service.yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: claude-proxy-service
     namespace: claude-proxy
   spec:
     selector:
       app: claude-proxy
     ports:
     - protocol: TCP
       port: 80
       targetPort: 8080
     type: LoadBalancer
   ```

### Deploy to Kubernetes

```bash
# Apply configurations
kubectl apply -f namespace.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Check status
kubectl get pods -n claude-proxy
kubectl get services -n claude-proxy
kubectl logs -f deployment/claude-proxy -n claude-proxy
```

## 📊 Monitoring Setup

### Prometheus and Grafana

```bash
# Start monitoring stack
pnpm run monitoring:start

# Access dashboards
# Grafana: http://localhost:3000 (admin/admin123)
# Prometheus: http://localhost:9090
# Alertmanager: http://localhost:9093

# Stop monitoring
pnpm run monitoring:stop
```

### Custom Metrics

The proxy exposes metrics at `/metrics`:

```bash
# View metrics
curl http://localhost:8080/metrics

# Key metrics to monitor:
# - proxy_requests_total
# - proxy_request_duration_seconds
# - proxy_reasoning_tokens_total
# - proxy_azure_openai_requests_total
# - proxy_active_conversations
```

## 🔄 Deployment Automation

### CI/CD Pipeline Example (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy Claude Proxy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          
      - name: Install pnpm
        run: corepack enable && corepack prepare pnpm@10.18.1 --activate
        
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Run tests
        run: pnpm test
        
      - name: Run security checks
        run: pnpm run security:all
        
      - name: Build application
        run: pnpm run build
        
      - name: Build Docker image
        run: docker build -t claude-proxy:${{ github.sha }} .
        
      - name: Deploy to staging
        if: github.ref == 'refs/heads/main'
        run: |
          # Deploy to staging environment
          echo "Deploying to staging..."
          
      - name: Run health checks
        run: |
          # Wait for deployment and run health checks
          sleep 30
          curl -f http://staging.example.com/health
```

### Automated Deployment Script

```bash
# Use the provided deployment script
./scripts/deploy.sh docker-compose

# With custom image tag
./scripts/deploy.sh docker claude-proxy:v1.0.0

# Deploy to App Runner
./scripts/deploy.sh app-runner
```

## 🔙 Rollback Procedures

### Docker Rollback

```bash
# Rollback to previous version
pnpm run rollback:docker-compose

# Rollback to specific version
./scripts/rollback.sh docker-compose v1.0.0

# List available versions
./scripts/rollback.sh list docker
```

### Kubernetes Rollback

```bash
# Rollback deployment
kubectl rollout undo deployment/claude-proxy -n claude-proxy

# Check rollout status
kubectl rollout status deployment/claude-proxy -n claude-proxy

# View rollout history
kubectl rollout history deployment/claude-proxy -n claude-proxy
```

### App Runner Rollback

```bash
# Use AWS Console or CLI
aws apprunner list-operations --service-arn <service-arn>
# Select previous deployment and redeploy
```

## 🔍 Health Checks and Monitoring

### Automated Health Checks

```bash
# Comprehensive health check
pnpm run health-check:verbose

# JSON output for monitoring
pnpm run health-check:json

# Custom health check
./scripts/health-check.sh -t 60 https://your-proxy.com
```

### Monitoring Endpoints

- **Health**: `GET /health` - Service health status
- **Metrics**: `GET /metrics` - Prometheus metrics
- **Service Info**: `GET /` - Basic service information

### Key Metrics to Monitor

1. **Availability**: Service uptime and health status
2. **Performance**: Response times and throughput
3. **Errors**: Error rates and types
4. **Resources**: Memory and CPU usage
5. **Reasoning**: Token usage and reasoning effort distribution
6. **Security**: Authentication failures and rate limiting

## 🚨 Troubleshooting

### Common Issues

1. **Service won't start**:
   ```bash
   # Check configuration
   pnpm run validate:config
   
   # Check logs
   docker logs claude-proxy
   ```

2. **Azure OpenAI connection issues**:
   ```bash
   # Test connectivity
   curl -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
        "$AZURE_OPENAI_ENDPOINT/openai/v1/models"
   ```

3. **High memory usage**:
   ```bash
   # Check conversation cleanup
   curl http://localhost:8080/health | jq '.checks.memory'
   ```

4. **Performance issues**:
   ```bash
   # Run performance check
   ./scripts/health-check.sh -v
   ```

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
export LOG_FORMAT=json

# Start with profiling
export ENABLE_PROFILING=true
pnpm start
```

### Support Resources

- **Logs**: Check application and container logs
- **Health Checks**: Use provided health check scripts
- **Monitoring**: Set up Prometheus and Grafana
- **Documentation**: Refer to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Environment variables configured and validated
- [ ] Security checks passed
- [ ] Tests passing
- [ ] Docker image built and scanned
- [ ] Health check endpoints working
- [ ] Monitoring configured

### Deployment

- [ ] Service deployed successfully
- [ ] Health checks passing
- [ ] Authentication working
- [ ] Azure OpenAI connectivity verified
- [ ] Format detection working
- [ ] Reasoning configuration validated

### Post-Deployment

- [ ] Monitoring alerts configured
- [ ] Performance metrics baseline established
- [ ] Rollback procedures tested
- [ ] Documentation updated
- [ ] Team notified

## 🔐 Security Considerations

### Production Security

- Use strong, unique API keys (32+ characters)
- Enable HTTPS in production
- Configure proper CORS settings
- Set up rate limiting
- Monitor for security events
- Regular security updates

### Network Security

- Use private networks where possible
- Configure firewalls appropriately
- Enable logging and monitoring
- Implement proper authentication
- Use secrets management systems

For detailed security guidelines, see the main documentation and security audit reports.