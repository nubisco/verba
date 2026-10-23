# syntax=docker/dockerfile:1

# ---- base: node 22 LTS with pnpm via corepack ----
# pnpm is the exact version in package.json "packageManager", so the image,
# CI and local installs agree. Bump both together.
FROM node:22.23.4-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# ---- build: full install + compile ----
FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @nubisco/verba-api --filter @nubisco/verba-shared

COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Switch Prisma provider to PostgreSQL for production and generate the client
# into apps/api/src/generated (no database needed, so DATABASE_URL is unset).
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' apps/api/prisma/schema.prisma \
    && sed -i 's/provider = "sqlite"/provider = "postgresql"/' apps/api/prisma/migrations/migration_lock.toml \
    && pnpm --filter @nubisco/verba-api exec prisma generate \
    && mkdir -p packages/ee/src \
    && printf 'export function isLicenseValid() { return false }\nexport function resolveEntitlements() { return {} }\nexport function hasFeature() { return false }\n' > packages/ee/src/index.ts \
    && echo '{"compilerOptions":{"composite":true,"outDir":"dist","rootDir":"src"},"include":["src"]}' > packages/ee/tsconfig.json \
    && pnpm --filter @nubisco/verba-shared build \
    && pnpm --filter @nubisco/verba-api build

# ---- deploy bundle: standalone dir with only prod deps (no symlinks) ----
# The Prisma client is generated into src/generated and compiled into dist, so
# it travels with the build output. The Prisma CLI is a production dependency
# of the API, so the bundle carries the exact version the lockfile pins.
FROM build AS bundle
RUN pnpm deploy --filter @nubisco/verba-api --prod /bundle

# ---- runtime: minimal, non-root ----
FROM node:22.23.4-alpine AS runtime
WORKDIR /app

# Copy the self-contained bundle
COPY --from=bundle --chown=node:node /bundle .
# Prisma schema (postgresql), migrations and CLI config for the boot-time db push
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./prisma.config.ts

# Build provenance, surfaced by GET /version. CI passes BUILD_HASH=${{ github.sha }}
# via docker/build-push-action build-args; version itself comes from package.json.
ARG BUILD_HASH=""
ENV VERBA_GIT_SHA=$BUILD_HASH

ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["sh", "-c", "node_modules/.bin/prisma db push --accept-data-loss 2>/dev/null || node_modules/.bin/prisma db push && node dist/index.js"]
