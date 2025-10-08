# Deployment and Operations Guide

## Overview

This document provides comprehensive guidance for deploying and operating the Claude-to-Azure OpenAI Proxy in production environments, with specific focus on AWS App Runner deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [AWS App Runner Deployment](#aws-app-runner-deployment)
- [Docker Deployment](#docker-deployment)
- [Monitoring and Observability](#monitoring-and-observability)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Prerequisites

### System Requirements

- **Node.js**: Version 22.0.0 or higher (LTS recommended)
- **Package Manager**: pnpm 10.18.1 or higher
- **TypeScript**: Version 5.3.0 or higher
- **Docker**: Version 20.10 or higher (for containerized deployment)

### Azure OpenAI Requirements

- Active Azure OpenAI resource with API access
- Deployed model (GPT-4, GPT-3.5-turbo, or similar)
- Valid API key with appropriate permissions

### AWS Requirements (for App Runner)

- AWS Account with App Runner service access
- IAM permissions for App Runner deployment
- Optional: AWS Secrets Manager for secure credential storage

## Environment Configuration

### Required Environment Variables

```bash
# Client Authentication
PROXY_API_KEY="your-secure-32-character-api-key-here"

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
AZURE_OPENAI_API_KEY="your-azure-openai-api-key"
AZURE_OPENAI_MODEL="your-model-deployment-name"

# Server Configuration
PORT=8080
NODE_ENV=production
```

### Environment Variable Validation

The application performs strict validation on startup:

- `PROXY_API_KEY`: 32-256 characters, used for client authentication
- `AZURE_OPENAI_ENDPOINT`: Valid HTTPS URL
- `AZURE_OPENAI_API_KEY`: 32-256 characters
- `AZURE_OPENAI_MODEL`: Alphanumeric with hyphens/underscores
- `PORT`: Integer between 1024-65535 (default: 8080)
- `NODE_ENV`: development|production|test (default: production)

### Configuration Security

- Never commit credentials to version control
- Use AWS Secrets Manager or similar for production secrets
- Rotate API keys regularly
- Monitor for credential exposure in logs

## AWS App Runner Deployment

### Step 1: Prepare Application

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Test locally:**
   ```bash
   npm start
   ```

3. **Verify health endpoint:**
   ```bash
   curl http://localhost:8080/health
   ```

### Step 2: Create App Runner Service

#### Using AWS Console

1. Navigate to AWS App Runner in the AWS Console
2. Click "Create service"
3. Choose "Source code repository" or "Container image"
4. Configure the following settings:

**Service Settings:**
- Service name: `claude-to-azure-proxy`
- Virtual CPU: 0.25 vCPU
- Memory: 0.5 GB
- Port: 8080

**Environment Variables:**
```
PROXY_API_KEY=your-secure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_MODEL=your-model-deployment
NODE_ENV=production
```

**Health Check:**
- Health check path: `/health`
- Health check interval: 10 seconds
- Health check timeout: 5 seconds
- Healthy threshold: 1
- Unhealthy threshold: 5

#### Using AWS CLI

```bash
# Create apprunner.yaml configuration file
cat > apprunner.yaml << EOF
version: 1.0
runtime: nodejs22
build:
  commands:
    build:
      - npm ci --production
      - npm run build
run:
  runtime-version: 22
  command: npm start
  network:
    port: 8080
    env: PORT
  env:
    - name: NODE_ENV
      value: production
EOF

# Deploy using AWS CLI
aws apprunner create-service \
  --service-name claude-to-azure-proxy \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "your-ecr-repo/claude-to-azure-proxy:latest",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  }'
```

### Step 3: Configure Auto Scaling

```bash
aws apprunner update-service \
  --service-arn "your-service-arn" \
  --auto-scaling-configuration-arn "your-auto-scaling-config-arn"
```

**Recommended Auto Scaling Settings:**
- Min instances: 1
- Max instances: 10
- Target CPU utilization: 70%
- Target memory utilization: 80%

## Docker Deployment

### Building the Container

```bash
# Build the Docker image
docker build -t claude-to-azure-proxy:latest .

# Tag for registry
docker tag claude-to-azure-proxy:latest your-registry/claude-to-azure-proxy:latest

# Push to registry
docker push your-registry/claude-to-azure-proxy:latest
```

### Running Locally

```bash
# Create environment file
cat > .env << EOF
PROXY_API_KEY=your-secure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_MODEL=your-model-deployment
PORT=8080
NODE_ENV=production
EOF

# Run container
docker run -d \
  --name claude-to-azure-proxy \
  --env-file .env \
  -p 8080:8080 \
  --restart unless-stopped \
  claude-to-azure-proxy:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  claude-to-azure-proxy:
    image: claude-to-azure-proxy:latest
    ports:
      - "8080:8080"
    environment:
      - PROXY_API_KEY=${PROXY_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_MODEL=${AZURE_OPENAI_MODEL}
      - PORT=8080
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Monitoring and Observability

### Health Monitoring

The application provides comprehensive health monitoring:

**Health Check Endpoint:** `GET /health`

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4",
  "checks": {
    "memory": {
      "status": "healthy",
      "responseTime": 1,
      "message": "Memory usage: 45.2%"
    }
  }
}
```

### Logging

All logs are structured JSON format suitable for log aggregation:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "correlationId": "uuid-v4",
  "message": "Request completed",
  "service": "claude-to-azure-proxy",
  "version": "1.0.0",
  "environment": "production",
  "metadata": {
    "request": {
      "method": "POST",
      "url": "/v1/completions",
      "ip": "192.168.1.1"
    },
    "response": {
      "statusCode": 200,
      "responseTime": 1250
    }
  }
}
```

### Metrics Collection

The application collects the following metrics:

**Performance Metrics:**
- Request duration
- Request success/failure rates
- Authentication success/failure rates

**Resource Metrics:**
- Memory usage (heap used/total)
- CPU usage
- Event loop lag

**Business Metrics:**
- API request counts by endpoint
- Completion request counts
- Error counts by type

### AWS CloudWatch Integration

For AWS App Runner deployments, logs are automatically sent to CloudWatch:

```bash
# View logs
aws logs describe-log-groups --log-group-name-prefix "/aws/apprunner/claude-to-azure-proxy"

# Stream logs
aws logs tail /aws/apprunner/claude-to-azure-proxy/service --follow
```

**Recommended CloudWatch Alarms:**

1. **High Error Rate:**
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name "claude-proxy-high-error-rate" \
     --alarm-description "High error rate detected" \
     --metric-name "ErrorRate" \
     --namespace "AWS/AppRunner" \
     --statistic "Average" \
     --period 300 \
     --threshold 5.0 \
     --comparison-operator "GreaterThanThreshold"
   ```

2. **High Memory Usage:**
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name "claude-proxy-high-memory" \
     --alarm-description "High memory usage detected" \
     --metric-name "MemoryUtilization" \
     --namespace "AWS/AppRunner" \
     --statistic "Average" \
     --period 300 \
     --threshold 80.0 \
     --comparison-operator "GreaterThanThreshold"
   ```

## Security Considerations

### Network Security

- **HTTPS Only:** Ensure all traffic uses HTTPS in production
- **CORS Configuration:** Restrict origins to known clients
- **Rate Limiting:** Global and per-IP rate limits are enforced

### Authentication Security

- **API Key Rotation:** Rotate `PROXY_API_KEY` regularly
- **Constant-Time Comparison:** Prevents timing attacks
- **Authentication Logging:** All attempts are logged

### Data Security

- **Log Sanitization:** Sensitive data is automatically redacted
- **No Data Persistence:** No user data is stored locally
- **Secure Headers:** Comprehensive security headers via Helmet

### Container Security

```bash
# Run security scan
npm run docker:security

# Check for vulnerabilities
npm audit --audit-level moderate
```

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

**Symptoms:** Application exits immediately on startup

**Diagnosis:**
```bash
# Check logs
docker logs claude-to-azure-proxy

# Common causes:
# - Missing required environment variables
# - Invalid Azure OpenAI endpoint
# - Port already in use
```

**Solutions:**
- Verify all required environment variables are set
- Test Azure OpenAI connectivity manually
- Check port availability

#### 2. Authentication Failures

**Symptoms:** 401 Unauthorized responses

**Diagnosis:**
```bash
# Test authentication
curl -H "Authorization: Bearer your-api-key" \
     http://localhost:8080/v1/models
```

**Solutions:**
- Verify `PROXY_API_KEY` matches client configuration
- Check for whitespace or encoding issues
- Ensure constant-time comparison is working

#### 3. Azure OpenAI Connection Issues

**Symptoms:** 503 Service Unavailable responses

**Diagnosis:**
```bash
# Test Azure OpenAI directly
curl -H "Authorization: Bearer your-azure-key" \
     -H "Content-Type: application/json" \
     "https://your-resource.openai.azure.com/openai/v1/models"
```

**Solutions:**
- Verify Azure OpenAI endpoint URL
- Check API key permissions
- Verify model deployment name
- Check Azure OpenAI service status

#### 4. High Memory Usage

**Symptoms:** Memory-related errors or crashes

**Diagnosis:**
```bash
# Monitor memory usage
docker stats claude-to-azure-proxy

# Check application metrics
curl http://localhost:8080/health
```

**Solutions:**
- Increase container memory allocation
- Check for memory leaks in logs
- Restart service if necessary

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Set environment variable
NODE_ENV=development

# Or use debug flag
DEBUG=* npm start
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- Monitor health check status
- Review error logs
- Check resource utilization

#### Weekly
- Review security logs
- Update dependencies (if needed)
- Rotate API keys (if policy requires)

#### Monthly
- Security vulnerability scan
- Performance review
- Capacity planning review

### Updates and Patches

1. **Test in staging environment first**
2. **Use blue-green deployment for zero downtime**
3. **Monitor health checks during deployment**
4. **Have rollback plan ready**

```bash
# Update deployment
aws apprunner start-deployment --service-arn "your-service-arn"

# Monitor deployment
aws apprunner describe-service --service-arn "your-service-arn"
```

### Backup and Recovery

**Configuration Backup:**
- Store environment variables in AWS Secrets Manager
- Version control all configuration files
- Document all custom settings

**Recovery Procedures:**
1. Redeploy from latest known good configuration
2. Verify all environment variables
3. Test health endpoint
4. Monitor logs for errors

### Performance Optimization

**Monitoring Performance:**
```bash
# Run performance tests
npm run monitoring:profile

# Analyze results
npm run monitoring:analyze
```

**Optimization Strategies:**
- Enable HTTP/2 if supported by load balancer
- Implement connection pooling for Azure OpenAI
- Use CDN for static assets (if any)
- Optimize container resource allocation

## Support and Escalation

### Log Analysis

When reporting issues, include:
- Correlation ID from error response
- Relevant log entries (sanitized)
- Environment configuration (without secrets)
- Steps to reproduce

### Performance Issues

Collect the following data:
- Resource utilization metrics
- Request/response times
- Error rates
- Concurrent user count

### Security Incidents

Immediate actions:
1. Rotate all API keys
2. Review access logs
3. Check for unauthorized access
4. Update security configurations

For additional support, refer to the project documentation or contact the development team.