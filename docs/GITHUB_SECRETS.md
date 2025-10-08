# GitHub Secrets Configuration

This document describes the GitHub secrets that need to be configured for the CI/CD pipeline to work
properly.

## Required Secrets

### Automatic Secrets (GitHub provides these)

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions for repository access

## How GitHub Actions Work

The CI/CD pipeline uses only the automatically provided `GITHUB_TOKEN` secret, which gives the
workflow permission to:

- Read repository contents
- Write to GitHub Container Registry (ghcr.io)
- Upload security scan results to GitHub Security tab
- Write comments on pull requests

## Security Scanning

The pipeline includes comprehensive security scanning:

1. **Environment File Security Check** - Ensures no sensitive files are exposed
2. **Trivy Vulnerability Scanner** - Scans container images for known vulnerabilities
3. **Hadolint** - Checks Dockerfile best practices
4. **Container Security Verification** - Ensures containers run as non-root user
5. **Health Check Testing** - Verifies application functionality

## No Additional Configuration Required

The security pipeline is designed to work out-of-the-box without requiring any additional secrets or
configuration. All security scan results are automatically uploaded to the GitHub Security tab for
easy review.

## Security Notes

- The `GITHUB_TOKEN` is automatically provided and rotated by GitHub
- All security scan results are uploaded to GitHub Security tab
- No external service credentials are required
- The pipeline follows security best practices with minimal permissions

## Troubleshooting

If you encounter issues with the security pipeline:

1. Check that GitHub Actions are enabled for your repository
2. Verify that the workflow has the necessary permissions (contents: read, packages: write,
   security-events: write)
3. Review the Actions logs for specific error messages
4. Ensure your repository has GitHub Advanced Security features enabled for security tab uploads
