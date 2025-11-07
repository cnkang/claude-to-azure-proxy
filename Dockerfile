# Dockerfile for backward compatibility - builds backend service
# For production, use apps/backend/Dockerfile or apps/frontend/Dockerfile directly

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable pnpm
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"
ENV UV_THREADPOOL_SIZE=4

# Dependencies stage - optimized for monorepo
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Copy workspace configuration if it exists
COPY pnpm-workspace.yaml* ./
# Copy all package.json files for workspace dependencies
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/shared-config/package.json ./packages/shared-config/
# Copy source files for packages that need to be built
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-utils/src ./packages/shared-utils/src
COPY packages/shared-utils/tsconfig.json ./packages/shared-utils/
COPY packages/shared-utils/tsconfig.build.json ./packages/shared-utils/
# Copy shared config for TypeScript
COPY packages/shared-config/typescript ./packages/shared-config/typescript
RUN if [ -f pnpm-workspace.yaml ]; then \
      echo "Installing dependencies for monorepo..." && \
      pnpm install --frozen-lockfile && \
      echo "Building shared packages..." && \
      pnpm build:shared && \
      echo "Dependencies and shared packages built successfully"; \
    else \
      pnpm install --frozen-lockfile; \
    fi

# Build stage - handle both monorepo and legacy structure
FROM base AS builder
# Copy source files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/backend ./apps/backend
COPY packages ./packages
COPY scripts ./scripts
# Copy node_modules and built shared packages from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared-types ./packages/shared-types
COPY --from=deps /app/packages/shared-utils ./packages/shared-utils
COPY --from=deps /app/packages/shared-config/node_modules ./packages/shared-config/node_modules
RUN if [ -f pnpm-workspace.yaml ]; then \
      # Monorepo build process with esbuild
      echo "Building backend application with esbuild..." && \
      DOCKER_BUILD=true pnpm build:backend && \
      echo "Preparing build output..." && \
      mkdir -p /app/build && \
      cp -R apps/backend/dist /app/build/dist && \
      echo "Build completed successfully"; \
    else \
      # Legacy build process
      pnpm run build; \
      mkdir -p /app/build; \
      cp -R dist /app/build/dist; \
      cp package.json /app/build/package.json; \
    fi

# Production dependencies stage - only install external dependencies
FROM base AS prod-deps
COPY --from=builder /app/build/dist/package.json ./package.json
RUN pnpm install --prod

# Frontend build stage
FROM base AS frontend-builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/frontend ./apps/frontend
COPY packages ./packages
# Copy node_modules and built shared packages from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /app/packages/shared-types ./packages/shared-types
COPY --from=deps /app/packages/shared-utils ./packages/shared-utils
COPY --from=deps /app/packages/shared-config/node_modules ./packages/shared-config/node_modules
RUN if [ -f pnpm-workspace.yaml ]; then \
      echo "Building frontend application..." && \
      pnpm --filter @repo/frontend build && \
      echo "Frontend build completed successfully"; \
    fi

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy bundled application and dependencies
COPY --from=builder --chown=appuser:nodejs /app/build/dist ./dist
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy frontend build if it exists
COPY --from=frontend-builder --chown=appuser:nodejs /app/apps/frontend/dist ./apps/frontend/dist

# Switch to non-root user
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use Node.js directly - Docker's --init flag handles signal forwarding
# Run with: docker run --init -p 8080:8080 <image>
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]
