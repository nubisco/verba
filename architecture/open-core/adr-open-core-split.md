# ADR: Open-Core Split

|             |            |
| ----------- | ---------- |
| **Status**  | Accepted   |
| **Date**    | 2026-03-21 |
| **Authors** | joseporto  |

---

## Context

Verba is an i18n collaboration tool initially built as a single-tier AGPL-3.0 open-source
project. As the product matures, there is a need to offer a commercial tier that funds
ongoing development while keeping the core tool free and open.

Two commercial deployment models are planned:

1. **Managed SaaS**, hosted by Nubisco, billed via Stripe.
2. **Self-hosted EE**, customer-operated, activated by a signed license key.

Both models require features (billing, SSO, advanced audit, resource limits, background
jobs, transactional email) that go beyond the open-source core.

## Decision

Adopt an **open-core** model:

- The **Community Edition (CE)** is the entire existing codebase, licensed AGPL-3.0.
- The **Enterprise Edition (EE)** is an additive layer (`packages/ee`) licensed under a
  proprietary Nubisco commercial license.
- The monorepo hosts both in a single repository under a split-license root.

### Boundary rules

| From                                            | To                            | Allowed? |
| ----------------------------------------------- | ----------------------------- | -------- |
| CE (`apps/`, `packages/shared`, `packages/cli`) | EE (`packages/ee`)            | **No**   |
| EE (`packages/ee`)                              | CE shared (`packages/shared`) | Yes      |
| EE (`packages/ee`)                              | CE apps                       | **No**   |

CE code importing EE would:

- Inadvertently bundle proprietary IP into AGPL distributions.
- Break OSS-only deployments that don't have the EE package installed.

EE importing CE shared is safe. Shared types (roles, statuses) have no proprietary content.

### Boot modes

The API supports two explicit boot modes via environment variables:

| Variable         | Effect                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `ENABLE_EE=true` | Dynamically loads EE modules at startup; logs EE features as active |
| `OSS_ONLY=true`  | Explicitly disables EE loading; ignores `ENABLE_EE` if both set     |
| _(neither)_      | Defaults to OSS-only; EE is not loaded                              |

Missing EE modules in OSS mode are silently skipped. The server never errors on absent EE code.

## Consequences

**Positive:**

- OSS users get the full CE feature set with no artificial restrictions.
- EE features are additive and toggled at boot time, not compile time.
- The import boundary lint rule prevents accidental coupling at CI time.
- Separate licenses in `packages/ee/LICENSE` and root `LICENSE` make the split legally clear.

**Negative / trade-offs:**

- Monorepo contributors can see EE stub code (by design, stubs document the interface).
- EE modules must expose no-op fallbacks or throw 402 errors in OSS mode; they cannot
  silently fail in unexpected ways.
- Shared types in `packages/shared` must remain CE-safe forever. Adding EE-specific
  fields there would be a boundary violation.

## Alternatives considered

| Option                                        | Reason rejected                                        |
| --------------------------------------------- | ------------------------------------------------------ |
| Separate EE repository                        | Harder to keep CE/EE in sync; no shared CI             |
| Runtime feature flags only (no code split)    | AGPL would apply to EE code if bundled together        |
| Dual `packages/` namespace (`oss/` and `ee/`) | Redundant. `packages/ee` is already the clean boundary |

## Related documents

- [target-structure.md](./target-structure.md)
- [import-boundaries.md](./import-boundaries.md)
