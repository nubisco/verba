# syntax=docker/dockerfile:1

# Which edition the image carries. `ce` (the default) is the public image: the
# Enterprise Edition is replaced by a stub, so no proprietary code ships in it.
# `ee` builds packages/ee into the image, for Nubisco's hosted Verba only. That
# image is pushed to a private package and never published.
# Declared before the first FROM, because a FROM line reads it.
ARG EDITION=ce

# ---- base: node 22 LTS with pnpm via corepack ----
# pnpm is the exact version in package.json "packageManager", so the image,
# CI and local installs agree. Bump both together.
FROM node:22.23.4-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# ---- build (Community Edition): full install + compile, EE stubbed ----
FROM base AS build-ce
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
# The migrations in apps/api/prisma/migrations are already PostgreSQL.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' apps/api/prisma/schema.prisma \
    && pnpm --filter @nubisco/verba-api exec prisma generate \
    && mkdir -p packages/ee/src \
    && printf 'export function isLicenseValid() { return false }\nexport function resolveEntitlements() { return {} }\nexport function hasFeature() { return false }\n' > packages/ee/src/index.ts \
    && echo '{"compilerOptions":{"composite":true,"outDir":"dist","rootDir":"src"},"include":["src"]}' > packages/ee/tsconfig.json \
    && pnpm --filter @nubisco/verba-shared build \
    && pnpm --filter @nubisco/verba-api build

# ---- build (Enterprise Edition): the same, with packages/ee compiled in ----
FROM base AS build-ee
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ee/package.json ./packages/ee/
RUN pnpm install --frozen-lockfile --filter @nubisco/verba-api --filter @nubisco/verba-shared --filter @nubisco/verba-ee

COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/ee ./packages/ee
COPY apps/api ./apps/api

# The EE package points `main` at its TypeScript source, which is what
# development and the tests load. The image runs compiled JavaScript, so the
# copy built here points at dist instead.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' apps/api/prisma/schema.prisma \
    && pnpm --filter @nubisco/verba-api exec prisma generate \
    && pnpm --filter @nubisco/verba-shared build \
    && pnpm --filter @nubisco/verba-ee build \
    && pnpm --filter @nubisco/verba-api build \
    && node -e "const f='packages/ee/package.json',p=require('./'+f);p.main='./dist/index.js';require('fs').writeFileSync(f,JSON.stringify(p,null,2))" \
    && test -f packages/ee/dist/index.js

FROM build-${EDITION} AS build

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
# Prisma schema (postgresql), migrations and CLI config for the boot-time migrate deploy
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./prisma.config.ts

# Build provenance, surfaced by GET /version. CI passes BUILD_HASH=${{ github.sha }}
# via docker/build-push-action build-args; version itself comes from package.json.
ARG BUILD_HASH=""
ENV VERBA_GIT_SHA=$BUILD_HASH

ENV NODE_ENV=production
EXPOSE 4000
USER node
# Apply pending migrations, then start. `migrate deploy` only ever runs the
# reviewed SQL in prisma/migrations, in order, and stops on the first failure,
# so a schema change can no longer drop a column on its own. A database created
# by the old `db push` start-up has no migration history: it must be baselined
# once by hand before this image runs against it (docs/self-hosting.md).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
