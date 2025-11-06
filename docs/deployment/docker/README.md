# Docker Deployment Guide

This guide covers Docker deployment for the Claude-to-Azure OpenAI Proxy monorepo, including both
development and production configurations.

## Overview

The project uses a multi-service Docker architecture with:

- **Backend Service**: Node.js API server (apps/backend)
- **Frontend Service**: React web application served by Nginx (apps/frontend)
- **Optimized Multi-stage Builds**: Separate dependency, build, and runtime stages
- **Security Hardening**: Non-root users, minimal privileges, read-only filesystems

## Quick Start

### Development Environment

```bash
# Start all services in development mode
pnpm docker:compose:up

# Or using Docker Compose directly
docker compose up -d

# View logs
docker compose logs -f

# Stop services
pnpm docker:compose:down
```

### Production Environment

```bash
# Start all services in production mode
pnpm docker:compose:prod

# Or using Docker Compose directly
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop services
pnpm docker:compose:prod:down
```

## Docker Configurations

### 1. Individual Service Dockerfiles

#### Backend Dockerfile (`apps/backend/Dockerfile`)

- **Base Image**: `node:24-alpine`
- **Multi-stage Build**: deps → builder → prod-deps → runner
- **Optimizations**:
  - Separate production dependencies stage
  - Security hardening with non-root user
  - Health checks and proper signal handling
- **Port**: 8080
- **User**: appuser (non-root)

#### Frontend Dockerfile (`apps/frontend/Dockerfile`)

- **Base Image**: `node:24-alpine` (build) → `nginx:1.27-alpine` (runtime)
- **Multi-stage Build**: deps → builder → runner
- **Optimizations**:
  - Nginx for static file serving
  - API proxy configuration
  - Security headers and caching
- **Port**: 80
- **User**: frontend (non-root)

#### Root Dockerfile (Backward Compatibility)

- Maintains compatibility with existing deployment scripts
- Automatically detects monorepo vs legacy structure
- Builds backend service by default

### 2. Docker Compose Configurations

#### Development (`docker-compose.yml`)

- **Services**: backend, frontend
- **Networks**: app-network (bridge)
- **Features**:
  - Service health checks
  - Dependency management (frontend depends on backend)
  - Development-friendly settings
  - Memory limits via override file

#### Production (`docker-compose.prod.yml`)

- **Enhanced Security**: Read-only filesystems, dropped capabilities
- **Resource Limits**: CPU and memory constraints
- **Logging**: JSON file driver with rotation
- **Restart Policy**: Always restart on failure
- **Health Checks**: Optimized intervals and timeouts

### 3. Build Optimization

#### .dockerignore Files

- **Root**: Excludes development files, documentation, logs
- **Backend**: Excludes frontend-specific files
- **Frontend**: Excludes backend-specific files

#### Multi-stage Benefits

- **Smaller Images**: Production images only contain runtime dependencies
- **Security**: Build tools and dev dependencies not in final image
- **Caching**: Efficient layer caching for faster rebuilds

## Available Scripts

### Build Commands

```bash
# Build all Docker images
pnpm docker:build:all

# Build individual services
pnpm docker:build:backend
pnpm docker:build:frontend

# Build with root Dockerfile (backward compatibility)
pnpm docker:build
```

### Run Commands

```bash
# Run individual services
pnpm docker:run:backend
pnpm docker:run:frontend

# Run with Docker Compose
pnpm docker:compose:up      # Development
pnpm docker:compose:prod    # Production
```

### Utility Commands

```bash
# Validate Docker configurations
pnpm docker:validate

# Security scanning
pnpm docker:security

# Clean up Docker resources
pnpm docker:clean
```

## Environment Variables

### Required Variables

```bash
PROXY_API_KEY=your-secure-32-character-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_MODEL=your-model-deployment-name
```

### Optional Variables

```bash
PORT=8080                           # Backend port (default: 8080)
FRONTEND_PORT=3000                  # Frontend port (default: 3000 dev, 80 prod)
NODE_ENV=production                 # Environment mode
AZURE_OPENAI_TIMEOUT=120000         # Request timeout (default: 120000ms)
AZURE_OPENAI_MAX_RETRIES=3          # Max retry attempts (default: 3)
DEFAULT_REASONING_EFFORT=medium     # Reasoning effort level
```

## Security Features

### Container Security

- **Non-root Users**: All services run as non-privileged users
- **Read-only Filesystems**: Prevents runtime file modifications
- **Dropped Capabilities**: Minimal required capabilities only
- **No New Privileges**: Prevents privilege escalation
- **Tmpfs Mounts**: Temporary files in memory

### Network Security

- **Internal Networks**: Services communicate via Docker networks
- **Health Checks**: Automated service health monitoring
- **Security Headers**: Nginx configured with security headers

### Image Security

- **Alpine Base**: Minimal attack surface
- **Security Updates**: Automatic security updates during build
- **Dependency Scanning**: Production dependencies only

## Monitoring and Health Checks

### Health Check Endpoints

- **Backend**: `GET /health` (port 8080)
- **Frontend**: `GET /health` (port 80)

### Health Check Configuration

```yaml
healthcheck:
  test: ['CMD', 'node', '-e', "require('http').get('http://localhost:8080/health', ...)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### Logging

- **Format**: JSON structured logging
- **Rotation**: 10MB max size, 3 files retained
- **Correlation IDs**: Request tracing across services

## Production Deployment

### Resource Requirements

- **Backend**: 1 CPU, 1GB RAM (limits), 0.5 CPU, 512MB RAM (reservations)
- **Frontend**: 0.5 CPU, 256MB RAM (limits), 0.25 CPU, 128MB RAM (reservations)

### Deployment Steps

1. **Environment Setup**:

   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Build and Deploy**:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. **Verify Deployment**:

   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs
   ```

4. **Health Check**:
   ```bash
   curl http://localhost:8080/health  # Backend
   curl http://localhost/health       # Frontend
   ```

### Scaling

```bash
# Scale backend service
docker compose -f docker-compose.prod.yml up -d --scale backend=3

# Scale with load balancer (requires additional configuration)
docker compose -f docker-compose.prod.yml -f docker-compose.scale.yml up -d
```

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Clear Docker cache
docker builder prune -a

# Rebuild without cache
docker compose build --no-cache
```

#### Permission Issues

```bash
# Check container user
docker compose exec backend whoami
docker compose exec frontend whoami
```

#### Network Issues

```bash
# Check network connectivity
docker compose exec backend ping frontend
docker compose exec frontend ping backend
```

#### Health Check Failures

```bash
# Check service logs
docker compose logs backend
docker compose logs frontend

# Manual health check
docker compose exec backend curl http://localhost:8080/health
```

### Debug Mode

```bash
# Run with debug output
docker compose --verbose up

# Access container shell
docker compose exec backend sh
docker compose exec frontend sh
```

## Best Practices

### Development

- Use `docker-compose.yml` for local development
- Mount source code for hot reloading (if needed)
- Use override files for developer-specific settings

### Production

- Always use `docker-compose.prod.yml` for production
- Set resource limits and health checks
- Use secrets management for sensitive data
- Monitor container metrics and logs

### Security

- Regularly update base images
- Scan images for vulnerabilities
- Use minimal base images (Alpine)
- Run containers as non-root users
- Enable read-only filesystems

### Performance

- Use multi-stage builds to minimize image size
- Leverage Docker layer caching
- Set appropriate resource limits
- Monitor container performance metrics

## Migration from Legacy Setup

If migrating from a single-container setup:

1. **Update Environment Variables**: No changes required
2. **Update Deployment Scripts**: Use new Docker Compose files
3. **Update Monitoring**: Health checks now on both services
4. **Update Load Balancer**: Point to frontend service (port 80)

The root Dockerfile maintains backward compatibility for existing deployment pipelines.
