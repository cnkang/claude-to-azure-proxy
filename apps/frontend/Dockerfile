# Frontend-only Dockerfile
# For production deployment with both frontend and backend, use the root Dockerfile instead
# This file is kept for backward compatibility and individual frontend deployment

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml* ./
COPY apps/frontend/package.json ./apps/frontend/
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
COPY apps/frontend ./apps/frontend
COPY packages ./packages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /app/packages/shared-types ./packages/shared-types
COPY --from=deps /app/packages/shared-utils ./packages/shared-utils
COPY --from=deps /app/packages/shared-config/node_modules ./packages/shared-config/node_modules
RUN pnpm --filter @repo/frontend build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy nginx configuration
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Create nginx config for SPA
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /health { \
        access_log off; \
        return 200 "healthy\n"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
