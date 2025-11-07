# Backend-only Dockerfile
# For production deployment with both frontend and backend, use the root Dockerfile instead
# This file is kept for backward compatibility and individual backend deployment

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable pnpm
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"
ENV UV_THREADPOOL_SIZE=4

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml* ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-utils/src ./packages/shared-utils/src
COPY packages/shared-utils/tsconfig.json ./packages/shared-utils/
COPY packages/shared-utils/tsconfig.build.json ./packages/shared-utils/
COPY packages/shared-config/typescript ./packages/shared-config/typescript
RUN pnpm install --frozen-lockfile && \
    pnpm build:shared

# Build stage
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/backend ./apps/backend
COPY packages ./packages
COPY scripts ./scripts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared-types ./packages/shared-types
COPY --from=deps /app/packages/shared-utils ./packages/shared-utils
COPY --from=deps /app/packages/shared-config/node_modules ./packages/shared-config/node_modules
RUN DOCKER_BUILD=true pnpm build:backend && \
    mkdir -p /app/build && \
    cp -R apps/backend/dist /app/build/dist

# Production dependencies
FROM base AS prod-deps
COPY --from=builder /app/build/dist/package.json ./package.json
RUN pnpm install --prod

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/build/dist ./dist
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]
