# Optimized multi-stage Docker build for backend service
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable pnpm
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"
ENV UV_THREADPOOL_SIZE=4

# Dependencies and build stage - install all dependencies and build
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
# Copy all packages directory content
COPY packages/ ./packages/
# Install all dependencies (including dev dependencies for building)
RUN pnpm install

# Copy source code and build
COPY . .
# Build shared packages in correct order, then backend
RUN pnpm --filter @repo/shared-types build
RUN pnpm --filter @repo/shared-utils build
RUN pnpm --filter @repo/shared-config build
RUN pnpm --filter @repo/backend build

# Production dependencies stage - install only production dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
# Copy all packages directory content
COPY packages/ ./packages/
RUN pnpm install --prod

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

# Install security updates and dumb-init
RUN apk update && apk upgrade && apk add --no-cache dumb-init
RUN rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy built application and production dependencies
COPY --from=builder --chown=appuser:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/apps/backend/package.json ./package.json
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Security hardening
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--init", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]
