# Open-Core Target Structure

_Last updated: 2026-03-21_

## Current layout

```
verba/
├── apps/
│   ├── api/                # Fastify + Prisma backend (CE)
│   └── web/                # Vue 3 frontend (CE)
├── packages/
│   ├── cli/                # @nubisco/verba-cli, installer & migration tool (CE)
│   ├── shared/             # @nubisco/verba-shared, shared types (CE)
│   └── ee/                 # @nubisco/verba-ee, Enterprise Edition (proprietary)
│       └── src/
│           ├── sso/            # SAML / SSO stubs
│           ├── audit/          # Advanced audit log stubs
│           └── organizations/  # Multi-tenancy stubs
├── docs/                   # VitePress documentation site (CE)
├── architecture/           # Architecture decision records (CE)
└── samples/                # Sample import files (CE)
```

## Target layout

The target structure separates the CE (Community Edition / AGPL) codebase from the EE
(Enterprise Edition / proprietary) in a single monorepo. `packages/ee` is the isolation
boundary, all proprietary code lives inside it.

```
verba/
├── apps/
│   ├── api/                # Fastify + Prisma backend (CE)
│   └── web/                # Vue 3 frontend (CE)
├── packages/
│   ├── cli/                # @nubisco/verba-cli, installer & migration tool (CE)
│   ├── shared/             # @nubisco/verba-shared, shared types, no side effects (CE)
│   └── ee/                 # @nubisco/verba-ee, Enterprise Edition (proprietary)
│       └── src/
│           ├── sso/            # SAML / OAuth SSO
│           ├── audit/          # Advanced audit log export
│           ├── organizations/  # Multi-tenancy / org management
│           ├── billing/        # Stripe subscription management
│           ├── licensing/      # Signed license key validation
│           ├── limits/         # Plan-based resource limits
│           ├── emails/         # Transactional email adapters
│           └── jobs/           # Background job orchestration (Trigger.dev)
├── docs/                   # VitePress documentation site (CE)
├── architecture/           # Architecture decision records
│   └── open-core/
│       ├── target-structure.md        ← this file
│       ├── adr-open-core-split.md
│       └── import-boundaries.md
└── samples/                # Sample import files (CE)
```

## Module classification

| Path              | License     | Notes                                            |
| ----------------- | ----------- | ------------------------------------------------ |
| `apps/api`        | AGPL-3.0    | CE backend                                       |
| `apps/web`        | AGPL-3.0    | CE frontend                                      |
| `packages/cli`    | AGPL-3.0    | CE CLI tool                                      |
| `packages/shared` | AGPL-3.0    | Shared types, must contain no EE-specific logic  |
| `packages/ee`     | Proprietary | All EE code; CE code must never import from here |
| `docs`            | CC-BY-4.0   | Public documentation                             |

## Cross-boundary coupling identified

Before the split was enforced, the following coupling risks existed:

- **`packages/shared`** contained a `hello()` stub that was a placeholder, no real
  coupling, but no real shared types either. Action: populate with CE-safe shared types.
- **`apps/api`** imported `@nubisco/verba-ee` in routes that handled EE feature checks.
  Action: EE routes must be optional-loaded and guarded by `ENABLE_EE` boot mode.
- **`packages/ee`** depends on `@nubisco/verba-shared`, this is the correct direction
  (EE may depend on CE shared types, but not vice versa).

## Modules needing refactoring before clean split

| Module                         | Issue                                | Action                                                 |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| `packages/shared`              | Empty stub (`hello()`)               | Populate with real shared types used by both CE and EE |
| `apps/api/src/routes/admin.ts` | May grow EE-specific admin endpoints | Route-level EE guard via boot mode                     |
| `apps/api/src/index.ts`        | No boot mode, EE is always attempted | Add `ENABLE_EE` / `OSS_ONLY` env var handling          |

## Acceptance criteria (issue #48)

- [x] This document exists at `architecture/open-core/target-structure.md`
- [x] All top-level apps and packages are classified as OSS or EE
- [x] Cross-boundary coupling has been identified and actioned
