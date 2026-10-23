# syntax=docker/dockerfile:1

# ---- base: node 22 LTS with pnpm via corepack ----
# pnpm is the exact version in package.json "packageManager", so the image,
# CI and local installs agree. Bump both together.
FROM node:22.23.4-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# ---- build ----
FROM base AS build
# VITE_API_URL is intentionally not set so the app defaults to /api
# (proxied by nginx to the API container). Pass as a build arg to override.
# VITE_* variables are inlined into the JS bundle at build time; they must be
# declared as ARG and re-exposed as ENV before `pnpm build` for Vite to see them.
ARG VITE_ANALYTICS_URL=""
ENV VITE_ANALYTICS_URL=$VITE_ANALYTICS_URL
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @nubisco/verba-web --filter @nubisco/verba-shared

COPY tsconfig.base.json tsconfig.json ./
# Vite 8.3 follows the root tsconfig's project references, so every referenced
# tsconfig has to exist even though the web build does not compile those packages.
COPY packages/ee/tsconfig.json ./packages/ee/
COPY apps/api/tsconfig.json ./apps/api/
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @nubisco/verba-shared build && pnpm --filter @nubisco/verba-web build

# ---- runtime: non-root nginx (port 8080) ----
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

