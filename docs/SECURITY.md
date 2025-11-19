# Security Guide

Security configuration and best practices for the Claude-to-Azure Proxy.

## 🔐 Authentication & Authorization

### API Key Security

```bash
# Generate secure proxy API key (32+ characters)
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Validate key strength
echo "API key length: ${#PROXY_API_KEY}"  # Should be 32+
```

### Azure OpenAI Security

- Use dedicated API keys for the proxy
- Rotate keys regularly (monthly recommended)
- Monitor usage in Azure portal
- Set up usage alerts and quotas

## 🛡️ Content Security

### Content Validation

```bash
# Production (default) - Enable for untrusted input
export ENABLE_CONTENT_SECURITY_VALIDATION=true

# Development - Disable for code review/documentation
export ENABLE_CONTENT_SECURITY_VALIDATION=false
```

**When to disable:**

- Code review and analysis
- Documentation processing
- Template development
- Internal development tools

**When to enable:**

- User-facing applications
- Untrusted input processing
- Production environments

### Blocked Content Types

- HTML with event handlers: `<div onclick="handler()">`
- Template syntax: `{{constructor}}`, `{{user.name}}`
- JavaScript protocols: `javascript:alert(1)`
- Script tags: `<script>code</script>`

## 🌐 Network Security

### CORS Configuration

```bash
# Production - Specific origins
export CORS_ORIGIN="https://yourdomain.com,https://app.yourdomain.com"

# Development - All origins (not for production)
export CORS_ORIGIN="*"
```

### Rate Limiting

```bash
# Configure rate limits
export RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
export RATE_LIMIT_MAX_REQUESTS=100      # Max requests per window

# Per-IP rate limiting
export RATE_LIMIT_PER_IP=true
```

### HTTPS Configuration

```bash
# Enable HTTPS in production
export HTTPS_CERT_PATH=/path/to/cert.pem
export HTTPS_KEY_PATH=/path/to/key.pem
export FORCE_HTTPS=true
```

## 🐳 Container Security

### Security Features

- ✅ **Non-root user**: Runs as UID 1001 (appuser)
- ✅ **Alpine Linux**: Minimal attack surface
- ✅ **Multi-stage build**: No build tools in final image
- ✅ **Read-only filesystem**: Supports read-only root
- ✅ **Dropped capabilities**: All unnecessary capabilities dropped
- ✅ **Health checks**: Built-in monitoring

### Security Scanning

```bash
# Run comprehensive security scan
make security-scan

# Individual scans
trivy image claude-to-azure-proxy:latest    # Vulnerability scan
docker scout cves claude-to-azure-proxy     # Docker Scout
hadolint Dockerfile                          # Dockerfile linting
```

### Runtime Security

```bash
# Run with security constraints
docker run --init --read-only --tmpfs /tmp \
  --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
  --user 1001:1001 \
  claude-to-azure-proxy:latest
```

## 🔑 Secrets Management

### Environment Variables

```bash
# Never commit secrets to git
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore

# Use .env.example as template
cp .env.example .env
# Edit .env with actual values
```

### Docker Secrets

```bash
# Create Docker secrets
echo "your-proxy-api-key" | docker secret create proxy_api_key -
echo "your-azure-api-key" | docker secret create azure_api_key -

# Use in compose
version: '3.8'
services:
  claude-proxy:
    secrets:
      - proxy_api_key
      - azure_api_key
```

### Kubernetes Secrets

```bash
# Create from command line
kubectl create secret generic claude-proxy-secrets \
  --from-literal=PROXY_API_KEY=your-proxy-key \
  --from-literal=AZURE_OPENAI_API_KEY=your-azure-key

# Create from files
kubectl create secret generic claude-proxy-secrets \
  --from-file=PROXY_API_KEY=proxy-key.txt \
  --from-file=AZURE_OPENAI_API_KEY=azure-key.txt
```

### AWS Secrets Manager

```bash
# Store secrets in AWS
aws secretsmanager create-secret \
  --name "claude-proxy/api-keys" \
  --secret-string '{
    "PROXY_API_KEY": "your-proxy-key",
    "AZURE_OPENAI_API_KEY": "your-azure-key"
  }'

# Retrieve in application
aws secretsmanager get-secret-value \
  --secret-id "claude-proxy/api-keys" \
  --query SecretString --output text
```

## 🔍 Security Monitoring

### Audit Logging

```bash
# Enable structured logging
export LOG_FORMAT=json
export LOG_LEVEL=info

# Log security events
export LOG_SECURITY_EVENTS=true
```

### Key Security Metrics

- Authentication failures
- Rate limit violations
- Content security violations
- Unusual request patterns
- Error rates and types

### Log Analysis

```bash
# Monitor authentication failures
grep "authentication.*failed" logs/app.log | jq -r '.ip' | sort | uniq -c

# Track rate limit violations
grep "rate.*limit" logs/app.log | jq -r '.ip' | sort | uniq -c

# Monitor content security events
grep "content.*security" logs/app.log | jq -r '.violation_type' | sort | uniq -c
```

## 🚨 Incident Response

### Security Incident Checklist

1. **Immediate Response**
   - [ ] Identify affected systems
   - [ ] Isolate compromised components
   - [ ] Preserve logs and evidence

2. **Assessment**
   - [ ] Determine scope of breach
   - [ ] Identify compromised data
   - [ ] Assess business impact

3. **Containment**
   - [ ] Rotate all API keys
   - [ ] Update security configurations
   - [ ] Apply security patches

4. **Recovery**
   - [ ] Restore from clean backups
   - [ ] Verify system integrity
   - [ ] Resume normal operations

5. **Post-Incident**
   - [ ] Document lessons learned
   - [ ] Update security procedures
   - [ ] Implement additional controls

### Emergency Procedures

```bash
# Emergency key rotation
export OLD_PROXY_API_KEY=$PROXY_API_KEY
export PROXY_API_KEY=$(openssl rand -base64 32)

# Restart service with new key
docker compose restart

# Revoke old Azure OpenAI key in Azure portal
# Generate new Azure OpenAI key
# Update AZURE_OPENAI_API_KEY and restart
```

## 🔒 Security Hardening

### Production Security Checklist

- [ ] **Strong API keys** (32+ characters, rotated regularly)
- [ ] **HTTPS enabled** with valid certificates
- [ ] **Content security validation** enabled for untrusted input
- [ ] **Rate limiting** configured appropriately
- [ ] **CORS** restricted to specific origins
- [ ] **Secrets management** using secure storage
- [ ] **Container security** with non-root user
- [ ] **Network security** with firewalls and VPNs
- [ ] **Monitoring** and alerting configured
- [ ] **Incident response** procedures documented

### Security Updates

```bash
# Regular security updates
docker pull alpine:latest  # Update base image
pnpm audit                  # Check dependencies
pnpm audit fix             # Fix vulnerabilities

# Automated security scanning in CI/CD
# - Trivy vulnerability scanning
# - Docker Scout analysis
# - Dependency auditing
# - Secret detection
```

## 🚨 Security Advisories

### Resolved Vulnerabilities

#### CVE-2025-56200: validator.js URL Validation Bypass

**Status**: ✅ RESOLVED - Migrated to Joi validation  
**Severity**: Moderate (CVSS 6.1)  
**Resolution**: Complete migration from express-validator to Joi

**Impact**: The project was not directly affected as it didn't use the vulnerable `isURL()`
function, but we proactively migrated to Joi validation for better security and maintainability.

**Actions Taken**:

- ✅ Removed express-validator dependency entirely
- ✅ Migrated all validation to secure Joi schemas
- ✅ Eliminated validator.js transitive dependency
- ✅ Verified no vulnerabilities remain: `pnpm audit`

### Security Review Process

1. **Weekly Audits**: `pnpm audit` for new vulnerabilities
2. **Dependency Updates**: Security review before updates
3. **Code Review**: Prevent vulnerable patterns
4. **CI/CD Integration**: Automated security scanning

### Compliance Considerations

- **Data Privacy**: No conversation data stored permanently
- **Encryption**: All data encrypted in transit (HTTPS/TLS)
- **Access Control**: API key-based authentication
- **Audit Trail**: Comprehensive logging with correlation IDs
- **Data Residency**: Respects Azure OpenAI data residency

## 📋 Security Assessment

### Self-Assessment Questions

1. Are all API keys strong and regularly rotated?
2. Is HTTPS enabled in production?
3. Are secrets properly managed (not in code/images)?
4. Is content security validation appropriate for your use case?
5. Are rate limits configured to prevent abuse?
6. Is monitoring and alerting set up for security events?
7. Are container security best practices followed?
8. Is network access properly restricted?
9. Are security updates applied regularly?
10. Is incident response procedure documented and tested?

### Security Testing

```bash
# Test authentication
curl -H "Authorization: Bearer invalid-key" http://localhost:8080/v1/models
# Should return 401 Unauthorized

# Test rate limiting
for i in {1..200}; do curl http://localhost:8080/health; done
# Should eventually return 429 Too Many Requests

# Test content security (if enabled)
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer valid-key" \
  -d '{"messages":[{"role":"user","content":"<script>alert(1)</script>"}]}'
# Should return 400 Bad Request if validation enabled
```

For implementation details, see:

- [Configuration Guide](./CONFIGURATION.md) - Security configuration options
- [Deployment Guide](./DEPLOYMENT.md) - Production security setup
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Security issue resolution
