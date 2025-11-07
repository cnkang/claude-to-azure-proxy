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
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/shared-config/package.json ./packages/shared-config/
# Copy source files for packages that need to be built
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-utils/src ./packages/shared-utils/src
COPY packages/shared-utils/tsconfig.json ./packages/shared-utils/
COPY packages/shared-utils/tsconfig.build.json ./packages/shared-utils/
RUN if [ -f pnpm-workspace.yaml ]; then \
      echo "Installing dependencies for monorepo..." && \
      pnpm install --frozen-lockfile && \
      echo "Dependencies installed successfully"; \
    else \
      pnpm install --frozen-lockfile; \
    fi

# Build stage - handle both monorepo and legacy structure
FROM base AS builder
# Copy source files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/backend ./apps/backend
COPY packages ./packages
# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/shared-utils/node_modules ./packages/shared-utils/node_modules
COPY --from=deps /app/packages/shared-config/node_modules ./packages/shared-config/node_modules
RUN if [ -f pnpm-workspace.yaml ]; then \
      # Monorepo build process
      echo "Building shared packages..." && \
      pnpm build:shared && \
      echo "Building backend application (without project references)..." && \
      cd apps/backend && \
      # Build without project references to avoid timestamp issues
      pnpm exec tsc --build --force && \
      cd ../.. && \
      echo "Preparing build output..." && \
      mkdir -p /app/build && \
      cp -R apps/backend/dist /app/build/dist && \
      cp apps/backend/package.json /app/build/package.json && \
      echo "Build completed successfully"; \
    else \
      # Legacy build process
      pnpm run build; \
      mkdir -p /app/build; \
      cp -R dist /app/build/dist; \
      cp package.json /app/build/package.json; \
    fi

# Production dependencies stage
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml* ./
COPY apps/backend/package.json ./apps/backend/
# Copy all package.json files for workspace dependencies
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/shared-config/package.json ./packages/shared-config/
# Copy built packages from builder stage (will be copied later)
RUN if [ -f pnpm-workspace.yaml ]; then \
      echo "Installing production dependencies for monorepo..." && \
      pnpm install --prod --frozen-lockfile && \
      echo "Production dependencies installed successfully"; \
    else \
      pnpm install --prod --frozen-lockfile; \
    fi

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy built application and production dependencies
COPY --from=builder --chown=appuser:nodejs /app/build/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/build/package.json ./package.json
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy workspace configuration and built shared packages for monorepo support
COPY --from=builder --chown=appuser:nodejs /app/pnpm-workspace.yaml* ./
COPY --from=builder --chown=appuser:nodejs /app/packages ./packages

# Switch to non-root user
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use Node.js directly - Docker's --init flag handles signal forwarding
# Run with: docker run --init -p 8080:8080 <image>
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]
