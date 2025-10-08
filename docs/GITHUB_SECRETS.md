# GitHub Secrets Configuration

This document describes the GitHub secrets that need to be configured for the CI/CD pipeline to work properly.

## Required Secrets

### Automatic Secrets (GitHub provides these)

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions for repository access

### Optional Secrets (for enhanced Docker Scout functionality)

These secrets are optional but recommended for better Docker Scout vulnerability scanning:

- `DOCKERHUB_USER` - Your Docker Hub username
- `DOCKERHUB_TOKEN` - Your Docker Hub access token

## How to Configure Secrets

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add the secret name and value

## Docker Hub Setup (Optional)

If you want to use Docker Scout with enhanced features:

1. Create a Docker Hub account at https://hub.docker.com
2. Go to **Account Settings** → **Security**
3. Click **New Access Token**
4. Create a token with **Public Repo Read** permissions
5. Add the username and token to GitHub secrets

## Without Docker Hub Secrets

The pipeline will still work without Docker Hub secrets, but Docker Scout may have limited functionality. The security scanning will still work using GitHub Container Registry.

## Security Notes

- Never commit secrets to your repository
- Use the minimum required permissions for access tokens
- Regularly rotate your access tokens
- Monitor secret usage in GitHub Actions logs (secrets are automatically masked)

## Troubleshooting

If you see Docker Scout authentication errors:
1. Verify your Docker Hub credentials are correct
2. Check that your Docker Hub token has the right permissions
3. You can disable Docker Scout by commenting out the step in `.github/workflows/docker-security.yml`

The security pipeline will continue to work with Trivy vulnerability scanning even without Docker Scout.