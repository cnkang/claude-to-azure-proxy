# Security Overview

This document outlines the comprehensive security measures implemented in the Claude-to-Azure Proxy project.

## 🔒 Environment File Security

### Protection Mechanisms

1. **Git Protection** (`.gitignore`):
   ```
   .env
   .env.local
   .env.development
   .env.test
   .env.production
   ```

2. **Docker Protection** (`.dockerignore`):
   ```
   .env
   .env.local
   .env.development
   .env.test
   .env.production
   ```

3. **Template System**:
   - `.env.example`: Safe template for developers
   - No sensitive data in version control

4. **Automated Validation**:
   - `scripts/security-check-env.sh`: Comprehensive security checks
   - GitHub Actions: Automated CI/CD security validation
   - Make targets: Easy local validation

### Validation Commands

```bash
# Check environment file security
npm run security:env
make security-check-env

# Run all security checks
npm run security:all
make all
```

## 🐳 Docker Security

### Container Hardening

1. **Non-root User**:
   - Runs as `appuser` (UID 1001)
   - No root privileges in container

2. **Minimal Base Image**:
   - Alpine Linux for reduced attack surface
   - Regular security updates applied

3. **Signal Handling**:
   - `dumb-init` for proper process management
   - Graceful shutdown on SIGTERM

4. **Multi-stage Build**:
   - Smaller production image
   - No development dependencies in final image

5. **Security Scanning**:
   - Trivy vulnerability scanning
   - Docker Scout security analysis
   - Hadolint Dockerfile linting

### Runtime Security

1. **Read-only Filesystem** (production):
   ```yaml
   read_only: true
   tmpfs:
     - /tmp:noexec,nosuid,size=100m
   ```

2. **Dropped Capabilities**:
   ```yaml
   cap_drop:
     - ALL
   cap_add:
     - NET_BIND_SERVICE
   ```

3. **Security Options**:
   ```yaml
   security_opt:
     - no-new-privileges:true
   ```

## 🛡️ Application Security

### API Security

1. **Authentication**:
   - API key validation for all requests
   - Secure key storage in environment variables

2. **Rate Limiting**:
   - Configurable request limits
   - Protection against abuse

3. **Input Validation**:
   - Request validation using express-validator
   - Schema validation with Joi
   - Configurable content security validation (`ENABLE_CONTENT_SECURITY_VALIDATION`)

4. **Security Headers**:
   - Helmet.js for security headers
   - CORS configuration

### Network Security

1. **HTTPS Enforcement** (production)
2. **CORS Configuration**
3. **Request Size Limits**
4. **Timeout Configuration**

## 🔍 Security Monitoring

### Health Checks

1. **Container Health**:
   - Built-in `/health` endpoint
   - Docker health check configuration
   - AWS App Runner compatibility

2. **Application Monitoring**:
   - Structured logging
   - Error tracking
   - Performance metrics

### Vulnerability Management

1. **Automated Scanning**:
   - Weekly security scans via GitHub Actions
   - Dependency vulnerability checks
   - Container image scanning

2. **Security Alerts**:
   - GitHub Security tab integration
   - SARIF report generation
   - Critical/High severity focus

## 📋 Security Checklist

### Development

- [ ] Copy `.env.example` to `.env`
- [ ] Configure required environment variables
- [ ] Run `npm run security:env` before committing
- [ ] Never commit `.env` files
- [ ] Use strong, unique API keys

### Deployment

- [ ] Use environment variables (not `.env` files)
- [ ] Enable HTTPS in production
- [ ] Configure proper CORS settings
- [ ] Set up monitoring and logging
- [ ] Use secrets management (AWS Secrets Manager)

### Maintenance

- [ ] Regular security scans (`make security-scan`)
- [ ] Update dependencies regularly
- [ ] Rotate API keys periodically
- [ ] Monitor security alerts
- [ ] Review access logs

## 🚨 Incident Response

### If `.env` File is Committed

1. **Immediate Actions**:
   ```bash
   # Remove from git
   git rm --cached .env
   git commit -m "Remove .env file from git"
   
   # Rotate all API keys immediately
   # Update production secrets
   ```

2. **Prevention**:
   ```bash
   # Verify .gitignore
   grep "\.env" .gitignore
   
   # Run security check
   npm run security:env
   ```

### If Vulnerability is Found

1. **Assessment**:
   - Determine severity and impact
   - Check if production is affected
   - Review security scan results

2. **Remediation**:
   - Update affected dependencies
   - Rebuild and redeploy containers
   - Verify fix with security scans

3. **Communication**:
   - Document the issue and fix
   - Update security documentation
   - Notify stakeholders if needed

## 📚 Security Resources

### Documentation

- [Environment Configuration Guide](docs/ENVIRONMENT.md)
- [Docker Security Guide](docs/DOCKER.md)
- [API Security Best Practices](docs/API.md)

### Tools and Scripts

- `scripts/security-check-env.sh`: Environment security validation
- `scripts/security-scan.sh`: Docker security scanning
- `.github/workflows/docker-security.yml`: CI/CD security automation

### External Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## 🔄 Security Updates

This security overview is regularly updated to reflect:

- New security measures implemented
- Updated best practices
- Lessons learned from security reviews
- Industry standard changes

Last updated: Current implementation includes comprehensive environment file protection, Docker security hardening, and automated security validation.

---

**Remember**: Security is an ongoing process, not a one-time setup. Regularly review and update security measures as the project evolves.