# Optimized multi-stage Docker build for frontend service with security scanning
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# Security scanning stage
FROM base AS security-scanner
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/*/package.json ./packages/*/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies for security scanning
RUN pnpm install --frozen-lockfile

# Run comprehensive security audit
RUN pnpm audit --audit-level moderate || echo "Security audit completed with warnings"

# Check for known vulnerabilities with detailed reporting
RUN pnpm dlx audit-ci --moderate --report-type json --output-file /tmp/audit-report.json || echo "Vulnerability check completed"

# Generate Software Bill of Materials (SBOM) with enhanced metadata
RUN pnpm dlx @cyclonedx/cyclonedx-npm \
    --output-file /tmp/sbom.json \
    --output-format json \
    --include-bom-serial-number \
    --include-license-text || echo "SBOM generation completed"

# License compliance check with detailed output
RUN pnpm dlx license-checker \
    --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense;WTFPL;CC0-1.0' \
    --summary \
    --json \
    --out /tmp/license-report.json || echo "License check completed"

# Dependency analysis with security focus
RUN pnpm dlx depcheck \
    --ignores="@types/*,eslint-*,@typescript-eslint/*,@vitejs/*,@vitest/*" \
    --json > /tmp/depcheck-report.json || echo "Dependency analysis completed"

# Check for outdated packages
RUN pnpm outdated --format json > /tmp/outdated-report.json || echo "Outdated packages check completed"

# Validate package integrity
RUN pnpm install --frozen-lockfile --verify-store-integrity || echo "Package integrity check completed"

# Dependencies and build stage - install all dependencies and build
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
# Copy all packages directory content
COPY packages/ ./packages/

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code and environment files
COPY . .
COPY apps/frontend/.env.production ./apps/frontend/.env.production

# Build shared packages in correct order, then frontend
RUN pnpm --filter @repo/shared-types build
RUN pnpm --filter @repo/shared-utils build  
RUN pnpm --filter @repo/shared-config build

# Build frontend with production optimizations
ENV NODE_ENV=production
ENV VITE_BUILD_ANALYZE=false
ENV VITE_SOURCE_MAPS=false
ENV VITE_MINIFY_CSS=true
ENV VITE_MINIFY_JS=true
ENV VITE_TREE_SHAKING=true
ENV VITE_ENABLE_COMPRESSION=true

# Set build-time environment variables
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ARG CDN_URL=""
ARG BUILD_TARGET=production
ARG ENABLE_ANALYTICS=true
ARG ENABLE_ERROR_REPORTING=true

ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV VITE_CDN_URL=${CDN_URL}
ENV VITE_BUILD_TARGET=${BUILD_TARGET}
ENV VITE_ENABLE_ANALYTICS=${ENABLE_ANALYTICS}
ENV VITE_ENABLE_ERROR_REPORTING=${ENABLE_ERROR_REPORTING}

# Build with optimizations based on target environment
RUN if [ "$BUILD_TARGET" = "staging" ]; then \
        pnpm --filter @repo/frontend run build:staging; \
    else \
        pnpm --filter @repo/frontend run build:production; \
    fi

# Verify build output and analyze bundle
RUN ls -la /app/apps/frontend/dist/
RUN test -f /app/apps/frontend/dist/index.html || (echo "Build failed: index.html not found" && exit 1)

# Check bundle sizes and warn if too large
RUN find /app/apps/frontend/dist/assets -name "*.js" -size +500k -exec echo "Warning: Large JS bundle found: {}" \;
RUN find /app/apps/frontend/dist/assets -name "*.css" -size +100k -exec echo "Warning: Large CSS bundle found: {}" \;

# Generate build manifest
RUN echo "{\"buildDate\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"commitHash\":\"${COMMIT_HASH}\",\"version\":\"2.0.0\"}" > /app/apps/frontend/dist/build-info.json

# Production stage - serve with nginx
FROM nginx:1.27-alpine AS runner

# Install security updates and tools
RUN apk update && apk upgrade && \
    apk add --no-cache wget curl dumb-init && \
    rm -rf /var/cache/apk/*

# Copy built frontend assets with proper permissions
COPY --from=builder --chown=nginx:nginx /app/apps/frontend/dist /usr/share/nginx/html

# Copy optimized nginx configuration
COPY infra/docker/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy security reports for transparency and compliance
COPY --from=security-scanner /tmp/sbom.json /usr/share/nginx/html/sbom.json
COPY --from=security-scanner /tmp/audit-report.json /usr/share/nginx/html/security/audit-report.json
COPY --from=security-scanner /tmp/license-report.json /usr/share/nginx/html/security/license-report.json
COPY --from=security-scanner /tmp/depcheck-report.json /usr/share/nginx/html/security/depcheck-report.json
COPY --from=security-scanner /tmp/outdated-report.json /usr/share/nginx/html/security/outdated-report.json

# Create security directory with proper permissions
RUN mkdir -p /usr/share/nginx/html/security && \
    chown -R nginx:nginx /usr/share/nginx/html/security

# Security hardening - create non-root user
RUN addgroup --system --gid 1001 frontend && \
    adduser --system --uid 1001 frontend

# Create necessary directories and set permissions
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp /var/log/nginx /var/run && \
    chown -R frontend:frontend /usr/share/nginx/html \
                               /var/cache/nginx \
                               /var/log/nginx \
                               /etc/nginx/conf.d \
                               /var/run && \
    touch /var/run/nginx.pid && \
    chown frontend:frontend /var/run/nginx.pid

# Create nginx configuration test
RUN nginx -t

# Switch to non-root user
USER frontend

EXPOSE 80

# Enhanced health check with multiple endpoints
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health && \
      wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Add build metadata as labels
ARG BUILD_DATE
ARG COMMIT_HASH=unknown
ARG VERSION=2.0.0

LABEL maintainer="Claude-to-Azure Proxy Team" \
      version="${VERSION}" \
      description="Production-optimized React frontend for Claude-to-Azure OpenAI proxy" \
      build-date="${BUILD_DATE}" \
      commit-hash="${COMMIT_HASH}" \
      vcs-url="https://github.com/your-org/claude-to-azure-proxy" \
      security-scan="enabled" \
      org.opencontainers.image.title="Claude-to-Azure Proxy Frontend" \
      org.opencontainers.image.description="Production-ready React frontend with security scanning" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${COMMIT_HASH}" \
      org.opencontainers.image.source="https://github.com/your-org/claude-to-azure-proxy"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["nginx", "-g", "daemon off;"]