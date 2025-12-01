# Security Updates

This document tracks security vulnerabilities and their fixes in the project.

## Recent Updates

### 2025-12-01: CVE-2024-58251 - ssl_client Vulnerability

**Severity:** MEDIUM  
**Package:** ssl_client  
**Affected Version:** 1.37.0-r19  
**Fixed Version:** 1.37.0-r20  
**CVE:** [CVE-2024-58251](https://nvd.nist.gov/vuln/detail/CVE-2024-58251)

**Description:**
Security vulnerability in ssl_client package from Alpine Linux base image.

**Impact:**
- Affects all Docker images using `node:24-alpine` and `nginx:alpine` base images
- Medium severity vulnerability in SSL/TLS client functionality

**Fix Applied:**
Updated all Dockerfiles to explicitly upgrade ssl_client package:

```dockerfile
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache --upgrade ssl_client && \
    rm -rf /var/cache/apk/*
```

**Files Modified:**
- `Dockerfile` (root - combined frontend/backend)
- `apps/backend/Dockerfile` (backend-only)
- `apps/frontend/Dockerfile` (frontend-only with nginx)

**Verification:**
After rebuilding Docker images, verify the fix with:

```bash
# Build the image
docker build -t claude-to-azure-proxy:latest .

# Check ssl_client version
docker run --rm claude-to-azure-proxy:latest apk info ssl_client

# Expected output: ssl_client-1.37.0-r20 or higher
```

**Recommendation:**
- Rebuild all Docker images immediately
- Deploy updated images to all environments
- Run security scan to verify fix: `docker scan claude-to-azure-proxy:latest`

---

## Security Best Practices

### Docker Image Security

1. **Regular Updates:**
   - Rebuild images weekly to get latest security patches
   - Monitor Alpine Linux security advisories
   - Subscribe to Node.js security notifications

2. **Base Image Selection:**
   - Use official images from trusted sources
   - Pin specific versions for reproducibility
   - Use Alpine Linux for smaller attack surface

3. **Security Scanning:**
   - Run `docker scan` before deployment
   - Use Trivy for comprehensive vulnerability scanning
   - Integrate security scanning in CI/CD pipeline

4. **Runtime Security:**
   - Run containers as non-root user
   - Use read-only file systems where possible
   - Limit container capabilities
   - Enable security profiles (AppArmor/SELinux)

### Dependency Security

1. **Node.js Dependencies:**
   - Run `pnpm audit` regularly
   - Fix high/critical vulnerabilities immediately
   - Use `pnpm audit --fix` for automatic fixes
   - Review dependency updates before applying

2. **Lock Files:**
   - Commit `pnpm-lock.yaml` to version control
   - Use `--frozen-lockfile` in CI/CD
   - Review lock file changes in PRs

3. **Overrides:**
   - Use pnpm overrides for transitive dependency fixes
   - Document all overrides in package.json
   - Review overrides regularly

### Monitoring and Response

1. **Vulnerability Monitoring:**
   - Enable GitHub Dependabot alerts
   - Monitor CVE databases
   - Subscribe to security mailing lists

2. **Incident Response:**
   - Assess severity and impact
   - Apply fixes promptly
   - Document changes
   - Notify stakeholders
   - Verify fix effectiveness

3. **Audit Trail:**
   - Maintain this security updates log
   - Document all security-related changes
   - Track remediation timelines

## Security Contacts

For security issues, please contact:
- Security Team: [security@example.com]
- Emergency: [emergency@example.com]

## References

- [Alpine Linux Security](https://alpinelinux.org/security/)
- [Node.js Security](https://nodejs.org/en/security/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [OWASP Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [CVE Database](https://cve.mitre.org/)
- [NVD](https://nvd.nist.gov/)
