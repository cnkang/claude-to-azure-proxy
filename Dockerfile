# Use Node.js 24 LTS Alpine base image with security updates
FROM node:24-alpine AS base

# Install security updates
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Install pnpm globally with specific version for consistency
RUN npm install -g pnpm@10.19.0 && \
    npm cache clean --force

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install dependencies in a separate layer for better caching
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && \
    pnpm store prune

# Build stage
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build && \
    pnpm store prune

# Production stage - optimized for Node.js 24 performance
FROM node:24-alpine AS runner

# Install security updates
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

WORKDIR /app

# Copy built application and dependencies with proper ownership
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json

# Switch to non-root user
USER appuser

# Expose port (will be set by PORT environment variable, default 8080)
EXPOSE 8080

# Enhanced health check with better error handling and timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node --enable-source-maps -e " \
    const http = require('http'); \
    const port = process.env.PORT || 8080; \
    const req = http.get(\`http://localhost:\${port}/health\`, { timeout: 8000 }, (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => { req.destroy(); process.exit(1); }); \
    "

# Set Node.js 24 optimizations
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512" \
    UV_THREADPOOL_SIZE=4

# No need for external init system - use Docker's built-in init
# Run with: docker run --init your-image

# Start the application
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]