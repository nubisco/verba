# syntax=docker/dockerfile:1

# ---- base: node 22 LTS with pnpm via corepack ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

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

# Generate Prisma client types, stub EE, then build.
RUN pnpm --filter @nubisco/verba-api exec prisma generate \
    && mkdir -p packages/ee/src \
    && printf 'export function isLicenseValid() { return false }\nexport function resolveEntitlements() { return {} }\nexport function hasFeature() { return false }\n' > packages/ee/src/index.ts \
    && echo '{"compilerOptions":{"composite":true,"outDir":"dist","rootDir":"src"},"include":["src"]}' > packages/ee/tsconfig.json \
    && pnpm --filter @nubisco/verba-shared build \
    && pnpm --filter @nubisco/verba-api build

# ---- deploy bundle: standalone dir with only prod deps (no symlinks) ----
FROM build AS bundle
RUN pnpm deploy --filter @nubisco/verba-api --prod /bundle
# Copy the generated Prisma client into the pnpm store path where ESM resolves it
RUN PRISMA_STORE=$(find /app/node_modules/.pnpm -path '*/@prisma+client*/node_modules/.prisma/client' -type d | head -1) \
    && BUNDLE_STORE=$(find /bundle/node_modules/.pnpm -path '*/@prisma+client*/node_modules/.prisma/client' -type d | head -1) \
    && if [ -n "$PRISMA_STORE" ] && [ -n "$BUNDLE_STORE" ]; then cp -r "$PRISMA_STORE"/* "$BUNDLE_STORE"/; fi

# ---- runtime: minimal, non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy the self-contained bundle
COPY --from=bundle --chown=node:node /bundle .

ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "dist/index.js"]
