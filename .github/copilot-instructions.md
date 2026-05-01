Nubisco Verba is an OSS, self-hostable i18n collaboration tool.

Stack: pnpm monorepo; Vue 3 + TypeScript + SCSS + Vite; Node.js + TypeScript + Fastify; Prisma with SQLite for dev and Postgres for production; Docker Compose.

Rules: flat keys internally; REST only; no GraphQL; no microservices; enforce ACL and workflow on the server; controllers must use services, never call Prisma directly; use zod for validation; add tests for ACL and workflow; stay within MVP scope in docs/ARCHITECTURE.md.
