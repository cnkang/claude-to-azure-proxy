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
# Copy package.json files for workspace dependencies
COPY apps/backend/package.json ./apps/backend/ 
# Copy all packages directory content
COPY packages/ ./packages/
RUN if [ -f pnpm-workspace.yaml ]; then \
      pnpm install; \
    else \
      pnpm install; \
    fi

# Build stage - handle both monorepo and legacy structure
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN if [ -f pnpm-workspace.yaml ]; then \
      # Monorepo build process
      pnpm build:shared && pnpm build:backend; \
      mkdir -p /app/build; \
      cp -R apps/backend/dist /app/build/dist; \
      cp apps/backend/package.json /app/build/package.json; \
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
# Copy all packages directory content
COPY packages/ ./packages/
RUN if [ -f pnpm-workspace.yaml ]; then \
      pnpm install --prod; \
    else \
      pnpm install --prod; \
    fi

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
COPY --from=builder --chown=appuser:nodejs /app/build/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/build/package.json ./package.json
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]
