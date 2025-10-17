# GitHub Actions Workflows Summary

This document provides a quick overview of the available GitHub Actions workflows in this project.

## 📋 Current Workflows

### 1. AWS ECR Pipeline (`.github/workflows/build-push-ecr.yml`) ⭐ **Recommended**

**Purpose**: Production-ready deployment to AWS Elastic Container Registry

**Key Features**:
- ✅ Secure AWS STS authentication (no stored credentials)
- ✅ Multi-architecture builds (AMD64/ARM64)
- ✅ Comprehensive security scanning with Trivy
- ✅ ECR native vulnerability scanning
- ✅ Semantic versioning support
- ✅ Automated deployment notifications

**Triggers**:
- Push to `main`, `develop` branches
- Version tags (`v1.0.0`, `v2.1.3`, etc.)
- Pull requests to `main` (build only, no push)

**Setup Required**:
- AWS account with ECR access
- GitHub repository variables configuration
- IAM role with OIDC trust relationship

### 2. GitHub Container Registry Pipeline (`.github/workflows/ci-cd.yml`)

**Purpose**: Open-source friendly deployment to GitHub Container Registry

**Key Features**:
- ✅ GitHub ecosystem integration
- ✅ Free for public repositories
- ✅ Comprehensive testing and quality checks
- ✅ Security scanning and reporting
- ✅ Multi-architecture support

**Triggers**:
- Push to `main`, `develop` branches
- Pull requests to `main`
- Weekly security scans (Sundays at 2 AM UTC)

**Setup Required**:
- GitHub repository with Actions enabled
- Optional: Codecov token for coverage reports

### 3. Security Scan Pipeline (`.github/workflows/security-scan.yml`)

**Purpose**: Periodic security scanning and vulnerability assessment

**Key Features**:
- ✅ Container vulnerability scanning
- ✅ Secret detection with TruffleHog
- ✅ Dependency security audit
- ✅ Automated security reporting

**Triggers**:
- Daily at 3 AM UTC
- Manual trigger via GitHub Actions UI

## 🎯 Which Workflow Should I Use?

### For Production Deployments
**Use**: AWS ECR Pipeline (`.github/workflows/build-push-ecr.yml`)

**Why**:
- More secure authentication with AWS STS
- Better integration with AWS services
- Advanced security scanning capabilities
- Production-grade container registry
- Cost-effective for private repositories

### For Open Source Projects
**Use**: GitHub Container Registry Pipeline (`.github/workflows/ci-cd.yml`)

**Why**:
- Free for public repositories
- Better GitHub ecosystem integration
- Easier setup (no AWS configuration required)
- Good for community contributions

### For Security Monitoring
**Use**: Both workflows include security scanning, but the dedicated Security Scan Pipeline provides additional periodic monitoring.

## 🚀 Quick Start Guide

### Option 1: AWS ECR (Recommended for Production)

1. **Run the setup script**:
   ```bash
   chmod +x scripts/setup-aws-github-actions.sh
   ./scripts/setup-aws-github-actions.sh
   ```

2. **Configure GitHub variables** (Settings > Secrets and variables > Actions):
   - `AWS_REGION`: `us-east-1`
   - `AWS_ROLE_ARN`: `arn:aws:iam::123456789012:role/GitHubActions-ECR-Role`
   - `ECR_REPOSITORY_NAME`: `claude-to-azure-proxy`

3. **Verify setup**:
   ```bash
   ./scripts/verify-aws-setup.sh
   ```

4. **Push to trigger workflow**:
   ```bash
   git push origin main
   # or create a version tag
   git tag v1.0.0 && git push origin v1.0.0
   ```

### Option 2: GitHub Container Registry (Simpler Setup)

1. **Enable GitHub Actions** in your repository settings

2. **Optional**: Add Codecov token to Secrets:
   - `CODECOV_TOKEN`: Your Codecov token

3. **Push to trigger workflow**:
   ```bash
   git push origin main
   ```

## 📊 Workflow Comparison

| Feature | AWS ECR | GitHub Container Registry |
|---------|---------|---------------------------|
| **Setup Complexity** | Medium (AWS resources needed) | Low (GitHub only) |
| **Security** | High (STS, IAM roles) | Medium (GitHub tokens) |
| **Cost** | Pay per GB stored | Free for public repos |
| **Performance** | Regional, fast in AWS | Global CDN |
| **Integration** | AWS ecosystem | GitHub ecosystem |
| **Multi-arch** | ✅ AMD64/ARM64 | ✅ AMD64/ARM64 |
| **Vulnerability Scanning** | ✅ Trivy + ECR native | ✅ Trivy |
| **Semantic Versioning** | ✅ Full support | ✅ Full support |
| **Production Ready** | ✅ Enterprise grade | ✅ Good for most use cases |

## 🔍 Monitoring and Troubleshooting

### Check Workflow Status
1. Go to your GitHub repository
2. Click the **Actions** tab
3. Select the workflow run to view details

### Common Issues and Solutions

#### AWS ECR Issues
- **Authentication failures**: Check IAM role and OIDC provider setup
- **Permission denied**: Verify ECR repository exists and IAM policy is correct
- **Region mismatch**: Ensure all AWS resources are in the same region

#### General Issues
- **Build failures**: Check Dockerfile syntax and dependencies
- **Test failures**: Verify test environment and dependencies
- **Security scan failures**: Review and update vulnerable dependencies

### Getting Help

- **Detailed Setup Guide**: [docs/GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)
- **Deployment Guide**: [docs/DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Troubleshooting**: [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Security Guide**: [../SECURITY.md](../SECURITY.md)

## 🔄 Migration from Old Workflows

If you're migrating from older workflow configurations:

1. **Backup existing workflows** (if any)
2. **Choose your preferred deployment target** (AWS ECR or GitHub Container Registry)
3. **Follow the setup guide** for your chosen option
4. **Test the new workflow** with a test branch first
5. **Update deployment scripts** and documentation as needed

The new workflows are designed to be more secure, efficient, and maintainable than previous versions.