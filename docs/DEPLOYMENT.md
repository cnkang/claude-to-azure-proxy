# Deployment Guide

Complete guide for deploying the Claude-to-Azure Proxy in production environments with Node.js 24 LTS optimizations.

## 🚀 Node.js 24 LTS Features

This application is optimized for Node.js 24 LTS and leverages:

- **Enhanced V8 13.6 Engine**: Improved JavaScript execution performance
- **Advanced Garbage Collection**: Better memory management and reduced GC pauses
- **Explicit Resource Management**: Automatic cleanup using `Symbol.dispose` and `Symbol.asyncDispose`
- **Improved HTTP Performance**: Enhanced HTTP/2 and streaming capabilities
- **Memory Leak Detection**: Built-in profiling tools for production monitoring
- **Performance Optimizations**: Optimized startup time and reduced memory footprint

### Node.js 24 Runtime Configuration

The application includes optimized Node.js 24 startup parameters:

```bash
# Production optimized startup
node --enable-source-maps \
     --max-old-space-size=1024 \
     --max-new-space-size=128 \
     --optimize-for-size \
     --gc-interval=100 \
     --incremental-marking \
     --concurrent-marking \
     --parallel-scavenge \
     dist/index.js
```

These optimizations provide:
- **Memory Efficiency**: Tuned heap sizes for proxy workloads
- **GC Performance**: Optimized garbage collection for low latency
- **Startup Speed**: Faster application initialization
- **Resource Management**: Automatic cleanup and leak prevention

## 🐳 Docker Deployment (Recommended)

### Quick Docker Setup
```bash
# Clone and configure
git clone <repository-url>
cd claude-to-azure-proxy
cp .env.example .env
# Edit .env with your configuration

# Deploy with Docker Compose
docker compose up -d

# Check status
docker compose ps
docker compose logs -f claude-proxy
```

### Docker Compose Configuration
```yaml
# docker-compose.yml (included)
version: '3.8'
services:
  claude-proxy:
    build: .
    ports:
      - "8080:8080"
    env_file: .env
    restart: unless-stopped
    init: true
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Production Optimizations (Node.js 24)
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  claude-proxy:
    environment:
      # Node.js 24 optimized settings
      - NODE_OPTIONS=--max-old-space-size=1024 --max-new-space-size=128 --optimize-for-size --gc-interval=100 --incremental-marking --concurrent-marking --parallel-scavenge
      - NODE_ENV=production
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
```

### Node.js 24 Memory Management
```yaml
# Advanced memory configuration for high-load environments
version: '3.8'
services:
  claude-proxy:
    environment:
      # High-performance Node.js 24 settings
      - NODE_OPTIONS=--max-old-space-size=2048 --max-new-space-size=256 --optimize-for-size --gc-interval=50 --incremental-marking --concurrent-marking --parallel-scavenge --expose-gc
      - NODE_ENV=production
      - ENABLE_MEMORY_MONITORING=true
      - GC_OPTIMIZATION=true
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
```

### Security Hardening
- ✅ Non-root user (UID 1001)
- ✅ Alpine Linux base image
- ✅ Multi-stage build
- ✅ Health checks
- ✅ Read-only filesystem support
- ✅ Dropped capabilities

## ☁️ AWS App Runner

### Prerequisites
- AWS CLI configured
- Container image in ECR or public registry
- Environment variables configured
- AWS Bedrock API access (optional, for Qwen model support)

### Deployment Steps

1. **Build and push image:**
```bash
# Build for AWS
docker build -t claude-proxy:latest .

# Tag for ECR
docker tag claude-proxy:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/claude-proxy:latest

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/claude-proxy:latest
```

2. **Create App Runner service:**
```yaml
# apprunner.yaml
version: 1.0
runtime: docker
build:
  commands:
    build:
      - echo "Using pre-built image"
run:
  runtime-version: latest
  command: node dist/index.js
  network:
    port: 8080
    env: PORT
  env:
    - name: NODE_ENV
      value: production
    # Optional: AWS Bedrock configuration for Qwen model support
    # - name: AWS_BEDROCK_API_KEY
    #   value: your-bedrock-api-key
    # - name: AWS_BEDROCK_REGION
    #   value: us-west-2
```

3. **Configure via AWS Console:**
- Go to AWS App Runner console
- Create new service from container image
- Configure environment variables
- Set up health checks (`/health` endpoint)

## 🎯 Kubernetes

### Basic Deployment
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claude-proxy
---
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
  # Optional: AWS Bedrock API key for Qwen model support
  # AWS_BEDROCK_API_KEY: "your-bedrock-api-key"
---
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
        - name: AZURE_OPENAI_ENDPOINT
          value: "https://your-resource.openai.azure.com"
        - name: AZURE_OPENAI_MODEL
          value: "gpt-4o"
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
        # Optional: AWS Bedrock configuration for Qwen model support
        # - name: AWS_BEDROCK_API_KEY
        #   valueFrom:
        #     secretKeyRef:
        #       name: claude-proxy-secrets
        #       key: AWS_BEDROCK_API_KEY
        # - name: AWS_BEDROCK_REGION
        #   value: "us-west-2"
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
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
---
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
kubectl apply -f namespace.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Check status
kubectl get pods -n claude-proxy
kubectl get services -n claude-proxy
kubectl logs -f deployment/claude-proxy -n claude-proxy
```

## 🔄 Load Balancing & Scaling

### Horizontal Pod Autoscaler (Kubernetes)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claude-proxy-hpa
  namespace: claude-proxy
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-proxy
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Docker Swarm
```yaml
# docker-stack.yml
version: '3.8'
services:
  claude-proxy:
    image: claude-proxy:latest
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
    secrets:
      - proxy_api_key
      - azure_api_key
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

secrets:
  proxy_api_key:
    external: true
  azure_api_key:
    external: true
```

## 📊 Monitoring Setup

### Prometheus + Grafana
```yaml
# monitoring/docker-compose.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'claude-proxy'
    static_configs:
      - targets: ['claude-proxy:8080']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Key Metrics to Monitor
- `proxy_requests_total` - Total requests
- `proxy_request_duration_seconds` - Response times
- `proxy_reasoning_tokens_total` - Token usage
- `proxy_active_conversations` - Active conversations
- `process_resident_memory_bytes` - Memory usage

## 🤖 AWS Bedrock Integration

### Bedrock Deployment Considerations

When deploying with AWS Bedrock support for Qwen models:

#### API Key Management
```bash
# Generate and store AWS Bedrock API key securely
export AWS_BEDROCK_API_KEY="your-bedrock-api-key"
export AWS_BEDROCK_REGION="us-west-2"

# Validate Bedrock configuration
curl -X POST "https://bedrock-runtime.us-west-2.amazonaws.com/model/qwen.qwen3-coder-480b-a35b-v1:0/converse" \
     -H "Authorization: Bearer $AWS_BEDROCK_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":[{"text":"test"}]}],"inferenceConfig":{"maxTokens":10}}'
```

#### Model Routing Configuration
```yaml
# docker-compose.yml with Bedrock support
version: '3.8'
services:
  claude-proxy:
    build: .
    ports:
      - "8080:8080"
    environment:
      # Required Azure OpenAI configuration
      - AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_MODEL=gpt-5-codex
      
      # Optional AWS Bedrock configuration (enables Qwen models)
      - AWS_BEDROCK_API_KEY=${AWS_BEDROCK_API_KEY}
      - AWS_BEDROCK_REGION=us-west-2
      - AWS_BEDROCK_TIMEOUT=120000
      - AWS_BEDROCK_MAX_RETRIES=3
    restart: unless-stopped
```

#### Health Check Updates
```bash
# Health check includes both services when Bedrock is configured
curl http://localhost:8080/health

# Expected response with Bedrock enabled:
{
  "status": "healthy",
  "services": {
    "azure": "healthy",
    "bedrock": "healthy"  // Only present when AWS_BEDROCK_API_KEY is configured
  },
  "models": ["gpt-5-codex", "qwen-3-coder", "qwen.qwen3-coder-480b-a35b-v1:0"]
}
```

#### Performance Considerations
- **Latency**: AWS Bedrock may have different latency characteristics than Azure OpenAI
  - Qwen models typically have 2-5 second response times for complex coding tasks
  - Configure `AWS_BEDROCK_TIMEOUT=120000` (2 minutes) for complex requests
- **Rate Limits**: Configure separate rate limits for Bedrock API calls
  - AWS Bedrock has different rate limits than Azure OpenAI
  - Monitor both services independently for rate limit violations
- **Monitoring**: Track metrics separately for Azure and Bedrock services
  - Use service identifiers in logs: `azure` vs `bedrock`
  - Track model-specific performance metrics
- **Fallback**: Ensure graceful degradation when one service is unavailable
  - Circuit breaker patterns prevent cascade failures
  - Clear error messages when services are down

#### Security Considerations
- **API Keys**: Store AWS Bedrock API keys securely alongside Azure keys
  - Use same security practices as Azure OpenAI keys
  - Rotate keys regularly and update configuration
- **Network**: Ensure outbound HTTPS access to `bedrock-runtime.us-west-2.amazonaws.com`
  - Configure firewall rules for AWS Bedrock endpoints
  - Use VPC endpoints for enhanced security in AWS environments
- **Logging**: AWS Bedrock API keys are automatically sanitized in logs
  - Keys are redacted as `[REDACTED]` in all log outputs
  - Error responses never expose API key information
- **Validation**: Bedrock configuration is validated at startup with fail-fast behavior
  - Invalid configuration prevents server startup
  - Clear error messages guide proper configuration

#### Regional Considerations
- **AWS Region**: Qwen models are only available in `us-west-2` region
  - Set `AWS_BEDROCK_REGION=us-west-2` explicitly
  - Consider latency implications for global deployments
- **Data Residency**: AWS Bedrock processes data in the configured region
  - Ensure compliance with data residency requirements
  - Consider GDPR and other regulatory implications
- **Availability**: Monitor AWS Bedrock service status for us-west-2
  - Subscribe to AWS service health notifications
  - Implement appropriate fallback strategies

## 🔐 Security Best Practices

### Network Security
```bash
# Use HTTPS in production
export HTTPS_CERT_PATH=/path/to/cert.pem
export HTTPS_KEY_PATH=/path/to/key.pem

# Configure firewall (example for Ubuntu)
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8080/tcp  # Don't expose directly
sudo ufw enable
```

### Secrets Management

**Kubernetes Secrets:**
```bash
# Create secrets from files
kubectl create secret generic claude-proxy-secrets \
  --from-file=PROXY_API_KEY=proxy-key.txt \
  --from-file=AZURE_OPENAI_API_KEY=azure-key.txt \
  --from-file=AWS_BEDROCK_API_KEY=bedrock-key.txt \
  -n claude-proxy
```

**Docker Secrets:**
```bash
# Create Docker secrets
echo "your-proxy-api-key" | docker secret create proxy_api_key -
echo "your-azure-api-key" | docker secret create azure_api_key -
echo "your-bedrock-api-key" | docker secret create bedrock_api_key -
```

**AWS Secrets Manager:**
```bash
# Store secrets in AWS
aws secretsmanager create-secret \
  --name "claude-proxy/api-keys" \
  --secret-string '{"PROXY_API_KEY":"your-key","AZURE_OPENAI_API_KEY":"your-azure-key","AWS_BEDROCK_API_KEY":"your-bedrock-key"}'
```

### Container Security
- ✅ Run as non-root user
- ✅ Use minimal base images
- ✅ Regular security updates
- ✅ Vulnerability scanning
- ✅ Read-only filesystem
- ✅ Dropped capabilities

## 🔄 Deployment Automation

### Automated Deployment Script
```bash
#!/bin/bash
# deploy.sh
set -e

ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}

echo "🚀 Deploying to $ENVIRONMENT with tag $IMAGE_TAG"

case $ENVIRONMENT in
  "docker-compose")
    docker compose pull
    docker compose up -d
    ;;
  "kubernetes")
    kubectl set image deployment/claude-proxy claude-proxy=claude-proxy:$IMAGE_TAG -n claude-proxy
    kubectl rollout status deployment/claude-proxy -n claude-proxy
    ;;
  "app-runner")
    aws apprunner start-deployment --service-arn $APP_RUNNER_SERVICE_ARN
    ;;
  *)
    echo "❌ Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac

echo "✅ Deployment completed"

# Health check
sleep 30
./scripts/health-check.sh
```

### Rollback Procedures
```bash
# Docker Compose rollback
docker compose down
docker compose up -d --force-recreate

# Kubernetes rollback
kubectl rollout undo deployment/claude-proxy -n claude-proxy
kubectl rollout status deployment/claude-proxy -n claude-proxy

# App Runner rollback (via AWS Console or CLI)
aws apprunner list-operations --service-arn $SERVICE_ARN
```

## 🔍 Health Checks & Monitoring

### Health Check Endpoints
- **`GET /health`** - Service health status
- **`GET /metrics`** - Prometheus metrics
- **`GET /`** - Basic service information

### Automated Health Monitoring
```bash
#!/bin/bash
# health-monitor.sh
HEALTH_URL="http://localhost:8080/health"

while true; do
  if ! curl -f -s "$HEALTH_URL" > /dev/null; then
    echo "❌ Health check failed at $(date)"
    # Send alert (email, Slack, etc.)
  else
    echo "✅ Health check passed at $(date)"
  fi
  sleep 60
done
```

### Load Testing
```bash
# Simple load test with curl
for i in {1..100}; do
  curl -X POST http://localhost:8080/v1/messages \
    -H "Authorization: Bearer your-key" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}' &
done
wait

# Using Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer your-key" \
   -p test-request.json -T application/json \
   http://localhost:8080/v1/messages
```

## 📋 Production Checklist

### Pre-Deployment
- [ ] Environment variables configured and validated
- [ ] Azure OpenAI connectivity tested
- [ ] AWS Bedrock connectivity tested (if configured)
- [ ] Model routing behavior verified
  - [ ] `qwen-3-coder` routes to AWS Bedrock
  - [ ] `qwen.qwen3-coder-480b-a35b-v1:0` routes to AWS Bedrock  
  - [ ] `gpt-5-codex` routes to Azure OpenAI
  - [ ] Unsupported models return appropriate errors
- [ ] Model availability confirmed
  - [ ] Azure models accessible via configured endpoint
  - [ ] Bedrock models accessible in us-west-2 region (if configured)
- [ ] Security scan passed
- [ ] Load testing completed
- [ ] Monitoring configured
- [ ] Backup procedures in place
- [ ] Rollback procedures tested

### Post-Deployment
- [ ] Health checks passing for all configured services
- [ ] Authentication working
- [ ] Model routing working correctly
- [ ] Both Azure and Bedrock endpoints responding (if configured)
- [ ] Performance metrics baseline established
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team notified

### Security Checklist
- [ ] Strong API keys (32+ characters)
- [ ] HTTPS enabled in production
- [ ] Secrets properly managed
- [ ] Network security configured
- [ ] Regular security updates scheduled
- [ ] Vulnerability scanning enabled

For CI/CD automation, see the [CI/CD Guide](./CICD.md).
For troubleshooting deployment issues, see the [Troubleshooting Guide](./TROUBLESHOOTING.md).