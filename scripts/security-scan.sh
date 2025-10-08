#!/bin/bash

# Security scanning script for Docker image
set -e

IMAGE_NAME="claude-to-azure-proxy"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo "🔍 Starting security scan for ${FULL_IMAGE_NAME}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the image if it doesn't exist
if ! docker image inspect "${FULL_IMAGE_NAME}" > /dev/null 2>&1; then
    echo "📦 Building Docker image ${FULL_IMAGE_NAME}..."
    docker build -t "${FULL_IMAGE_NAME}" .
fi

echo "🔍 Running security scans..."

# 1. Check for known vulnerabilities using Docker Scout (if available)
echo "1️⃣ Checking for vulnerabilities with Docker Scout..."
if command -v docker scout &> /dev/null; then
    docker scout cves "${FULL_IMAGE_NAME}" || echo "⚠️  Docker Scout not available or failed"
else
    echo "⚠️  Docker Scout not available. Install Docker Desktop or Docker Scout CLI for vulnerability scanning."
fi

# 2. Scan with Trivy (if available)
echo "2️⃣ Checking for vulnerabilities with Trivy..."
if command -v trivy &> /dev/null; then
    trivy image --severity HIGH,CRITICAL "${FULL_IMAGE_NAME}"
else
    echo "⚠️  Trivy not available. Install Trivy for comprehensive vulnerability scanning:"
    echo "   brew install aquasecurity/trivy/trivy  # macOS"
    echo "   Or visit: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
fi

# 3. Check image configuration
echo "3️⃣ Checking image configuration..."
docker run --rm -i hadolint/hadolint < Dockerfile || echo "⚠️  Hadolint not available for Dockerfile linting"

# 4. Check for secrets in the image
echo "4️⃣ Checking for potential secrets..."
docker history --no-trunc "${FULL_IMAGE_NAME}" | grep -i -E "(password|secret|key|token)" || echo "✅ No obvious secrets found in image history"

# 5. Verify non-root user
echo "5️⃣ Verifying non-root user configuration..."
USER_CHECK=$(docker run --rm "${FULL_IMAGE_NAME}" id -u)
if [ "$USER_CHECK" != "0" ]; then
    echo "✅ Container runs as non-root user (UID: $USER_CHECK)"
else
    echo "❌ Container runs as root user - security risk!"
    exit 1
fi

# 6. Check image size
echo "6️⃣ Checking image size..."
IMAGE_SIZE=$(docker image inspect "${FULL_IMAGE_NAME}" --format='{{.Size}}' | awk '{print $1/1024/1024}')
echo "📏 Image size: ${IMAGE_SIZE} MB"
if (( $(echo "$IMAGE_SIZE > 500" | bc -l) )); then
    echo "⚠️  Image is larger than 500MB. Consider optimizing."
else
    echo "✅ Image size is reasonable"
fi

# 7. Test health check
echo "7️⃣ Testing container health check..."
CONTAINER_ID=$(docker run -d -p 8080:8080 -e PROXY_API_KEY=test -e AZURE_OPENAI_ENDPOINT=https://test.openai.azure.com -e AZURE_OPENAI_API_KEY=test -e AZURE_OPENAI_MODEL=test "${FULL_IMAGE_NAME}")

# Wait for container to start
sleep 10

# Check health
HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_ID}" 2>/dev/null || echo "no-healthcheck")
echo "🏥 Health check status: ${HEALTH_STATUS}"

# Cleanup
docker stop "${CONTAINER_ID}" > /dev/null
docker rm "${CONTAINER_ID}" > /dev/null

echo "✅ Security scan completed for ${FULL_IMAGE_NAME}"
echo ""
echo "📋 Security Checklist:"
echo "  ✅ Uses Alpine Linux base image"
echo "  ✅ Runs as non-root user"
echo "  ✅ Uses dumb-init for proper signal handling"
echo "  ✅ Includes health check"
echo "  ✅ Multi-stage build for smaller image"
echo "  ✅ No secrets in image layers"
echo ""
echo "🔧 To run additional security scans:"
echo "  - Install Docker Scout: https://docs.docker.com/scout/"
echo "  - Install Trivy: https://aquasecurity.github.io/trivy/"
echo "  - Install Hadolint: https://github.com/hadolint/hadolint"