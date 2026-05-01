# syntax=docker/dockerfile:1

# ---- base: node 22 LTS with pnpm via corepack ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# ---- build ----
FROM base AS build
# VITE_API_URL is intentionally not set so the app defaults to /api
# (proxied by nginx to the API container). Pass as a build arg to override.
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @nubisco/verba-web --filter @nubisco/verba-shared

COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @nubisco/verba-shared build && pnpm --filter @nubisco/verba-web build

# ---- runtime: non-root nginx (port 8080) ----
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

