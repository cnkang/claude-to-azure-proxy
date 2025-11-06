# Production Deployment Guide

This guide covers the production deployment configuration and optimization for the Claude-to-Azure
OpenAI Proxy with web frontend.

## Overview

The production deployment includes:

- **Optimized Vite build** with Terser minification and advanced compression
- **Multi-stage Docker builds** with security scanning and SBOM generation
- **Environment-specific configurations** for staging and production
- **CDN-friendly asset optimization** with proper caching headers
- **Comprehensive security scanning** for dependencies and containers
- **Automated deployment scripts** for multiple platforms

## Quick Start

### 1. Validate Configuration

```bash
# Validate all production configurations
make validate-production

# Or using npm/pnpm
pnpm run validate:production
```

### 2. Build Production Images

```bash
# Build optimized production images
make build-production

# Or using npm/pnpm
pnpm run docker:build:production
```

### 3. Deploy to Production

```bash
# Deploy using Docker Compose
make deploy-production

# Deploy with CDN optimization
make deploy-production-cdn

# Or using npm/pnpm
pnpm run deploy:production
pnpm run deploy:production-cdn
```

## Build Configurations

### Frontend Build Optimization

The Vite configuration includes advanced production optimizations:

#### Terser Configuration

- **Advanced compression**: Multiple passes with unsafe optimizations
- **Dead code elimination**: Removes unused code and console statements
- **Mangling**: Optimizes variable and function names
- **ASCII-only output**: Ensures compatibility across environments

#### Code Splitting Strategy

- **React vendor chunk**: React and React DOM in separate bundle
- **Router chunk**: React Router in dedicated bundle
- **i18n chunk**: Internationalization libraries
- **Component chunks**: UI components grouped logically
- **Utility chunks**: Helper functions and services

#### Asset Optimization

- **Inline assets**: Small assets (<4KB) inlined as data URLs
- **CDN-friendly naming**: Hash-based filenames for cache busting
- **Compression**: Gzip and Brotli compression enabled
- **Preloading**: Critical resources preloaded for faster loading

### Environment Configurations

#### Production (.env.production)

```bash
VITE_APP_ENVIRONMENT=production
VITE_ENABLE_DEBUG=false
VITE_ENABLE_ANALYTICS=true
VITE_SOURCE_MAPS=false
VITE_MINIFY_CSS=true
VITE_MINIFY_JS=true
```

#### Staging (.env.staging)

```bash
VITE_APP_ENVIRONMENT=staging
VITE_ENABLE_DEBUG=true
VITE_ENABLE_ANALYTICS=false
VITE_SOURCE_MAPS=true
```

## Docker Configuration

### Multi-Stage Build Process

#### 1. Security Scanner Stage

- Comprehensive dependency audit
- SBOM (Software Bill of Materials) generation
- License compliance checking
- Vulnerability scanning with detailed reports

#### 2. Builder Stage

- Shared package compilation
- Frontend build with environment-specific optimizations
- Bundle analysis and size validation
- Build artifact verification

#### 3. Production Stage

- Nginx-based serving with security hardening
- Non-root user execution
- Read-only filesystem
- Security headers and CSP configuration

### Security Features

#### Container Security

- **Non-root user**: All containers run as non-privileged users
- **Read-only filesystem**: Containers use read-only root filesystem
- **Security options**: `no-new-privileges` and capability dropping
- **Resource limits**: Memory and CPU limits enforced

#### Network Security

- **Rate limiting**: API and static content rate limits
- **CORS configuration**: Proper cross-origin resource sharing
- **Security headers**: Comprehensive security header set
- **CSP policy**: Content Security Policy for XSS protection

## Deployment Options

### 1. Docker Compose (Recommended)

#### Standard Production

```bash
# Deploy with standard configuration
docker-compose -f docker-compose.prod.yml up -d
```

#### CDN-Optimized Production

```bash
# Deploy with CDN caching layer
docker-compose -f docker-compose.prod-cdn.yml up -d
```

### 2. Kubernetes

```bash
# Deploy to Kubernetes cluster
make deploy-kubernetes
```

Requires Kubernetes manifests in `infra/k8s/` directory.

### 3. AWS App Runner

```bash
# Deploy to AWS App Runner
make deploy-aws-app-runner
```

Uses the `apprunner.yaml` configuration file.

## CDN Configuration

### Self-Hosted CDN

The `docker-compose.prod-cdn.yml` includes a self-hosted CDN cache layer:

- **Nginx-based caching**: Aggressive caching for static assets
- **Cache invalidation**: Purge endpoints for cache management
- **Performance monitoring**: Cache hit ratio tracking
- **CORS support**: Cross-origin resource sharing for CDN assets

### External CDN Integration

For external CDN services (CloudFlare, AWS CloudFront, etc.):

1. Set the `CDN_URL` environment variable:

```bash
export CDN_URL="https://cdn.example.com"
```

2. Build with CDN optimization:

```bash
make build-cdn
```

3. Upload assets to your CDN service
4. Configure CDN to proxy API requests to your backend

## Monitoring and Observability

### Health Checks

All services include comprehensive health checks:

#### Backend Health Check

- **Endpoint**: `/health`
- **Checks**: Service status, database connectivity, external API availability
- **Timeout**: 10 seconds with 3 retries

#### Frontend Health Check

- **Endpoint**: `/health`
- **Checks**: Nginx status, static asset availability
- **Build info**: `/build-info.json` with version and build metadata

### Logging

#### Structured Logging

- **JSON format**: Machine-readable log format
- **Correlation IDs**: Request tracing across services
- **Performance metrics**: Response times and resource usage
- **Security events**: Authentication and rate limiting events

#### Log Aggregation

- **Docker logging**: JSON file driver with rotation
- **Centralized collection**: Compatible with ELK, Fluentd, etc.
- **Retention policy**: Configurable log retention

### Metrics Collection

#### Application Metrics

- **Request rates**: Requests per second by endpoint
- **Response times**: P50, P95, P99 latencies
- **Error rates**: 4xx and 5xx error percentages
- **Resource usage**: Memory, CPU, and disk utilization

#### Business Metrics

- **Model usage**: Requests by AI model
- **User sessions**: Active sessions and conversation counts
- **Feature adoption**: Usage of different frontend features

## Security Considerations

### Build-Time Security

#### Dependency Scanning

- **Audit level**: Moderate and above vulnerabilities flagged
- **License compliance**: Only approved licenses allowed
- **SBOM generation**: Complete software bill of materials
- **Outdated packages**: Regular checks for package updates

#### Container Scanning

- **Base image**: Regular security updates for Alpine Linux
- **Vulnerability scanning**: Trivy integration for container scanning
- **Secret detection**: No secrets embedded in images
- **Minimal attack surface**: Only necessary packages included

### Runtime Security

#### Network Security

- **TLS encryption**: HTTPS enforced in production
- **Rate limiting**: Protection against abuse and DoS
- **Input validation**: All user inputs validated and sanitized
- **CORS policy**: Restrictive cross-origin policies

#### Data Protection

- **No data persistence**: Stateless application design
- **Session isolation**: Browser session-based isolation
- **Local encryption**: Client-side data encryption
- **API key protection**: Backend credentials never exposed

## Performance Optimization

### Frontend Performance

#### Bundle Optimization

- **Tree shaking**: Unused code elimination
- **Code splitting**: Lazy loading of non-critical components
- **Asset optimization**: Image compression and format optimization
- **Preloading**: Critical resource preloading

#### Runtime Performance

- **Virtual scrolling**: Efficient rendering of large lists
- **Memoization**: Component and computation memoization
- **Service workers**: Offline support and caching
- **Web vitals**: Core Web Vitals monitoring

### Backend Performance

#### Resource Optimization

- **Memory limits**: Appropriate memory allocation
- **CPU optimization**: Multi-core utilization
- **Connection pooling**: Efficient external API connections
- **Caching**: Response caching where appropriate

#### Scaling Considerations

- **Horizontal scaling**: Stateless design for easy scaling
- **Load balancing**: Multiple backend instances support
- **Circuit breakers**: Resilience against external failures
- **Graceful degradation**: Fallback mechanisms

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Check build logs
docker-compose -f docker-compose.prod.yml logs frontend

# Validate configuration
make validate-production

# Clean and rebuild
make clean-build && make build-production
```

#### Deployment Issues

```bash
# Check service health
docker-compose -f docker-compose.prod.yml ps

# View service logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

#### Performance Issues

```bash
# Monitor resource usage
docker stats

# Check application metrics
curl http://localhost:8080/health
curl http://localhost/health

# Analyze bundle size
pnpm run build:analyze
```

### Debug Mode

For production debugging (use with caution):

```bash
# Enable debug mode
BUILD_TARGET=staging make build-production

# Deploy with debug enabled
BUILD_TARGET=staging make deploy-production
```

## Maintenance

### Regular Tasks

#### Security Updates

- **Weekly**: Dependency security audit
- **Monthly**: Base image updates
- **Quarterly**: Comprehensive security review

#### Performance Monitoring

- **Daily**: Health check validation
- **Weekly**: Performance metrics review
- **Monthly**: Capacity planning review

#### Backup and Recovery

- **Configuration backup**: Version control for all configurations
- **Image backup**: Tagged images in registry
- **Rollback procedures**: Automated rollback scripts

### Upgrade Procedures

#### Application Updates

1. Run validation: `make validate-production`
2. Build new images: `make build-production`
3. Test in staging environment
4. Deploy with zero-downtime strategy
5. Monitor post-deployment metrics

#### Infrastructure Updates

1. Update base images and dependencies
2. Run security scans
3. Test in isolated environment
4. Schedule maintenance window
5. Execute rolling updates

## Best Practices

### Development Workflow

- **Feature branches**: All changes via pull requests
- **Automated testing**: CI/CD pipeline validation
- **Security scanning**: Automated security checks
- **Performance testing**: Regular performance validation

### Deployment Workflow

- **Staging first**: Always test in staging environment
- **Gradual rollout**: Phased deployment approach
- **Monitoring**: Continuous monitoring during deployment
- **Rollback plan**: Always have rollback procedures ready

### Security Practices

- **Principle of least privilege**: Minimal required permissions
- **Defense in depth**: Multiple security layers
- **Regular audits**: Periodic security assessments
- **Incident response**: Prepared incident response procedures

## Support and Documentation

### Additional Resources

- [API Documentation](../api/README.md)
- [Architecture Overview](../architecture/README.md)
- [Security Guide](../security/README.md)
- [Performance Guide](../performance/README.md)

### Getting Help

- Check the troubleshooting section above
- Review application logs for error details
- Consult the monitoring dashboards
- Contact the development team for complex issues
