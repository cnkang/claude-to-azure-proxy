# Docker Deployment Guide

This guide covers building, running, and deploying the Claude-to-Azure Proxy using Docker, with a
focus on security best practices and AWS App Runner compatibility.

## Quick Start

### Prerequisites

- Docker 20.10+ installed
- Docker Compose (optional, for local development)
- Make (optional, for simplified commands)
- Environment variables configured (see [Environment Guide](ENVIRONMENT.md))

### Build and Run

```bash
# Build the Docker image
make build
# or
docker build -t claude-to-azure-proxy .

# Run the container
make run
# or
docker run --init -d -p 8080:8080 --env-file .env claude-to-azure-proxy
```

## Security Features

### 🔒 Security Hardening

- **Non-root user**: Container runs as user `appuser` (UID 1001)
- **Alpine Linux**: Minimal attack surface with security updates
- **dumb-init**: Proper signal handling and zombie process reaping
- **Multi-stage build**: Smaller final image with only production dependencies
- **Health checks**: Built-in health monitoring
- **Read-only filesystem**: Container runs with read-only root filesystem (in production)
- **Dropped capabilities**: All unnecessary Linux capabilities are dropped

### 🛡️ Security Scanning

Run comprehensive security scans:

```bash
# Run all security checks
make security-scan

# Individual scans
docker scout cves claude-to-azure-proxy:latest  # Docker Scout
trivy image claude-to-azure-proxy:latest        # Trivy scanner
hadolint Dockerfile                              # Dockerfile linting
```

## Build Options

### Standard Build

```bash
make build
```

### AWS App Runner Optimized Build

```bash
make aws-build
```

This creates a Linux/AMD64 image optimized for AWS App Runner deployment.

### No-Cache Build

```bash
make build-no-cache
```

Forces a complete rebuild without using Docker layer cache.

## Running the Container

### Local Development

```bash
# Interactive mode (logs to console)
make run-interactive

# Background mode
make run
make logs  # View logs
```

### Docker Compose

```bash
# Start services
make compose-up

# View logs
make compose-logs

# Stop services
make compose-down
```

### Environment Variables

Required environment variables:

```bash
PROXY_API_KEY=your-proxy-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_MODEL=your-model-deployment-name
```

Optional:

```bash
PORT=8080                    # Server port (default: 8080)
NODE_ENV=production          # Node.js environment
```

## AWS App Runner Deployment

### Image Requirements

The Docker image is optimized for AWS App Runner with:

- **Port binding**: Listens on `PORT` environment variable
- **Health checks**: `/health` endpoint for App Runner monitoring
- **Graceful shutdown**: Handles SIGTERM signals properly
- **Fast startup**: Optimized for quick container initialization
- **Security**: Non-root user and minimal attack surface

### Deployment Steps

1. **Build and push image to ECR**:

```bash
# Tag for ECR
docker tag claude-to-azure-proxy:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/claude-proxy:latest

# Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/claude-proxy:latest
```

2. **Create App Runner service**:

```yaml
# apprunner.yaml
version: 1.0
runtime: docker
build:
  commands:
    build:
      - echo "No build commands needed - using pre-built image"
run:
  runtime-version: latest
  command: node dist/index.js
  network:
    port: 8080
    env: PORT
  env:
    - name: NODE_ENV
      value: production
    - name: PROXY_API_KEY
      value: your-proxy-api-key
    - name: AZURE_OPENAI_ENDPOINT
      value: https://your-resource.openai.azure.com
    - name: AZURE_OPENAI_API_KEY
      value: your-azure-api-key
    - name: AZURE_OPENAI_MODEL
      value: your-model-deployment-name
```

3. **Configure health checks**:

App Runner will automatically use the `/health` endpoint for health monitoring.

## Image Optimization

### Size Optimization

The multi-stage Dockerfile optimizes image size by:

- Using Alpine Linux base image (~5MB)
- Multi-stage build to exclude development dependencies
- Removing unnecessary files and caches
- Using `.dockerignore` to exclude build context files

### Performance Optimization

- **Layer caching**: Optimized layer order for better caching
- **Dependency caching**: Dependencies installed in separate layer
- **Build caching**: GitHub Actions cache for faster CI/CD builds

## Monitoring and Logging

### Health Checks

The container includes built-in health checks:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' container-name

# Manual health check
curl http://localhost:8080/health
```

### Logging

Structured JSON logs are written to stdout for easy integration with log aggregation systems:

```bash
# View container logs
make logs

# Follow logs in real-time
docker logs -f container-name
```

### Metrics

Monitor container metrics:

```bash
# Container stats
docker stats container-name

# Image size
make size
```

## Troubleshooting

### Common Issues

1. **Container exits immediately**:

   ```bash
   # Check logs
   docker logs container-name

   # Verify environment variables
   docker run --rm -it claude-to-azure-proxy env
   ```

2. **Health check fails**:

   ```bash
   # Test health endpoint manually
   docker exec container-name wget -qO- http://localhost:8080/health
   ```

3. **Permission denied errors**:
   ```bash
   # Verify non-root user
   docker run --rm claude-to-azure-proxy id
   ```

### Debug Mode

Run container with debug logging:

```bash
docker run --init -e NODE_ENV=development -e DEBUG=* claude-to-azure-proxy
```

## Security Best Practices

### Container Security

- ✅ Run as non-root user
- ✅ Use minimal base image (Alpine)
- ✅ Regular security updates
- ✅ No secrets in image layers
- ✅ Read-only filesystem in production
- ✅ Dropped Linux capabilities
- ✅ Health monitoring

### Network Security

- ✅ Expose only necessary ports
- ✅ Use HTTPS in production
- ✅ Implement rate limiting
- ✅ Validate all inputs

### Secrets Management

- ✅ Use environment variables for secrets
- ✅ Never embed secrets in image
- ✅ Use AWS Secrets Manager in production
- ✅ Rotate secrets regularly
- ✅ .env files excluded from git and Docker builds
- ✅ Use .env.example as template for developers

### Environment File Security

The project includes comprehensive protection for `.env` files:

```bash
# Check environment file security
make security-check-env
# or
npm run security:env
```

**Protection mechanisms:**

- `.gitignore`: Prevents `.env` files from being committed to git
- `.dockerignore`: Excludes `.env` files from Docker build context
- `.env.example`: Provides template without sensitive data
- Security scripts: Automated checks for proper exclusion

## CI/CD Integration

### GitHub Actions

The repository includes automated security scanning:

- **Trivy**: Vulnerability scanning
- **Docker Scout**: Security analysis
- **Hadolint**: Dockerfile linting
- **Health checks**: Container functionality testing

### Manual Security Scan

```bash
# Run comprehensive security scan
make security-scan

# Individual tools
trivy image claude-to-azure-proxy:latest
docker scout cves claude-to-azure-proxy:latest
hadolint Dockerfile
```

## Production Checklist

Before deploying to production:

- [ ] Security scan passed
- [ ] Health checks working
- [ ] Environment variables configured
- [ ] Secrets properly managed
- [ ] Monitoring and logging configured
- [ ] Backup and recovery plan
- [ ] Performance testing completed
- [ ] Documentation updated

## Support

For issues related to Docker deployment:

1. Check container logs: `make logs`
2. Run security scan: `make security-scan`
3. Verify health checks: `make test-health`
4. Review this documentation
5. Check GitHub Issues for known problems
