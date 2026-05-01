# Plan & Entitlement Model

This document describes the internal product model that powers Verba's feature gating, resource limits, and billing integration.

## Principles

1. **Entitlements are the source of truth.** Plans map to a base set of entitlements. Guards check entitlements, never plan IDs directly.
2. **Overrides take precedence.** An `EntitlementOverride` on an org replaces or augments its resolved entitlements, regardless of plan.
3. **OSS mode is first-class.** Without any license key or billing config, Verba runs as `oss_self_hosted` with unlimited resources and no EE features.
4. **No billing provider required for OSS.** The entitlement resolution service works without Stripe or a license key.

## Plan tiers

| Plan ID                  | Mode         | Managed | License key | Notes                   |
| ------------------------ | ------------ | ------- | ----------- | ----------------------- |
| `oss_self_hosted`        | Self-hosted  | No      | No          | Default when no config  |
| `free`                   | Managed SaaS | Yes     | No          | Entry tier              |
| `pro`                    | Managed SaaS | Yes     | No          | Paid, some EE features  |
| `business`               | Managed SaaS | Yes     | No          | Paid, advanced features |
| `enterprise`             | Managed SaaS | Yes     | No          | Unlimited, all features |
| `self_hosted_enterprise` | Self-hosted  | No      | Yes         | EE features via key     |

## Entitlement features

| Feature                 | Description                   | Available from                         |
| ----------------------- | ----------------------------- | -------------------------------------- |
| `sso`                   | SAML/SSO authentication       | `enterprise`, `self_hosted_enterprise` |
| `advanced_audit_export` | Export audit logs as CSV/JSON | `business`+                            |
| `multi_tenancy`         | Organisation management       | `enterprise`, `self_hosted_enterprise` |
| `ai_suggestions`        | AI translation suggestions    | `pro`+                                 |
| `webhooks`              | Outbound webhooks             | `pro`+                                 |
| `api_tokens`            | Personal API token generation | `pro`+                                 |
| `custom_roles`          | Custom member roles           | `business`+                            |
| `priority_support`      | SLA-backed support            | `enterprise`, `self_hosted_enterprise` |

## Resource limits by plan

| Limit                 | `free` | `pro`  | `business` | `enterprise` / EE |
| --------------------- | ------ | ------ | ---------- | ----------------- |
| Max projects          | 3      | 10     | 50         | unlimited         |
| Max seats / project   | 5      | 20     | 100        | unlimited         |
| Max keys / project    | 500    | 5,000  | unlimited  | unlimited         |
| Max locales / project | 5      | 20     | unlimited  | unlimited         |
| Max monthly API calls | n/a    | 10,000 | 100,000    | unlimited         |

All limits are `null` (unlimited) for `oss_self_hosted`.

## Entitlement resolution order

```
1. Determine active plan
   a. OSS: plan = oss_self_hosted (no Stripe, no license key)
   b. Managed SaaS: read active Subscription from DB → planId
   c. Self-hosted EE: validate LICENSE_KEY → planId from key payload

2. Load base entitlements for plan

3. Apply EntitlementOverride (if any exists for the org):
   - features (if set): replaces the feature set entirely
   - featureAdditions (if set): merged onto resolved features
   - limit fields (if set): replace individual resource limits

4. Return EntitlementContext
```

## Subscription lifecycle (managed SaaS)

```
          ┌──────────┐
     ┌───▶│ trialing │─────┐
     │    └──────────┘     │
     │                     ▼
  create               ┌────────┐       ┌──────────┐
  checkout ──────────▶ │ active │──────▶│ past_due │
                       └────────┘       └──────────┘
                           │                 │
                    cancel │                 │ unpaid
                           ▼                 ▼
                      ┌──────────┐     ┌──────────┐
                      │ canceled │     │ canceled │
                      └──────────┘     └──────────┘
```

States: `trialing`, `active`, `past_due`, `canceled`, `paused`, `incomplete`

## License state (self-hosted EE)

| State     | Meaning                                               |
| --------- | ----------------------------------------------------- |
| `none`    | No `LICENSE_KEY` env var (OSS mode)                   |
| `valid`   | Key present and signature verified                    |
| `grace`   | Key expired but within grace period (default 14 days) |
| `expired` | Key expired and grace period elapsed                  |
| `invalid` | Key present but signature or structure is wrong       |

Grace period allows self-hosted instances to continue operating during network outages or delayed renewals.

## TypeScript types

See [`packages/ee/src/entitlements/types.ts`](../../packages/ee/src/entitlements/types.ts) for the canonical TypeScript definitions.

See [`packages/ee/src/entitlements/plans.ts`](../../packages/ee/src/entitlements/plans.ts) for the plan registry with base entitlements.
