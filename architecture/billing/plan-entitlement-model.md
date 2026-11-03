# Plan & Entitlement Model

This document describes the internal product model that powers Verba's feature gating, resource limits, and billing integration.

## Principles

1. **Entitlements are the source of truth.** Plans map to a base set of entitlements. Guards check entitlements, never plan IDs directly.
2. **Overrides take precedence.** An `EntitlementOverride` on an org replaces or augments its resolved entitlements, regardless of plan.
3. **OSS mode is first-class.** Without any license key or billing config, Verba runs as `oss_self_hosted` with unlimited resources and no EE features.
4. **No billing provider required for OSS.** The entitlement resolution service works without the licenses service or a license key.

## Plan tiers

Decided by Jose on 2026-11-03: hosted Verba is Free and Pro, which differ only by limits. Anything larger is "contact sales": a sales override in Nubisco's licenses service for a hosted account, or a licence key for a self-hosted one.

| Plan ID                  | Mode        | Managed | License key | Notes                                  |
| ------------------------ | ----------- | ------- | ----------- | -------------------------------------- |
| `oss_self_hosted`        | Self-hosted | No      | No          | Default when no config                 |
| `free`                   | Hosted      | Yes     | No          | Entry plan                             |
| `pro`                    | Hosted      | Yes     | No          | Paid, the same features, higher limits |
| `self_hosted_enterprise` | Self-hosted | No      | Yes         | "Contact us": enterprise features      |

## Entitlement features

Plans limit usage, they do not lock features. AI suggestions, API tokens and webhooks are on every plan. Only the enterprise features need a licence key (or a sales deal).

| Feature                 | Description                                                                                             | Available on             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `ai_suggestions`        | AI translation suggestions, on the customer's own key                                                   | every plan               |
| `webhooks`              | Outbound webhooks                                                                                       | every plan               |
| `api_tokens`            | Personal API token generation                                                                           | every plan               |
| `sso`                   | SAML/SSO authentication                                                                                 | `self_hosted_enterprise` |
| `advanced_audit_export` | Export audit logs as CSV/JSON                                                                           | `self_hosted_enterprise` |
| `multi_tenancy`         | Per-account plans, limits, billing and self-serve account creation (accounts, members and roles are CE) | `self_hosted_enterprise` |
| `custom_roles`          | Custom member roles                                                                                     | `self_hosted_enterprise` |
| `priority_support`      | SLA-backed support                                                                                      | `self_hosted_enterprise` |

## Resource limits by plan

All limits are account totals. `null` is unlimited.

| Limit    | `free` | `pro`     | `oss_self_hosted` / `self_hosted_enterprise` |
| -------- | ------ | --------- | -------------------------------------------- |
| Projects | 3      | 10        | unlimited                                    |
| Members  | 5      | 25        | unlimited                                    |
| Keys     | 1,500  | 15,000    | unlimited                                    |
| Locales  | 5      | unlimited | unlimited                                    |

Pro's numbers are the Paddle product Verba Pro's. Free's are the earlier per-project caps (5 seats, 500 keys and 5 locales in each of 3 projects) expressed as account totals. The per-project and API-call caps are no longer set on any plan.

For a hosted account (billing configured, see docs/plans-and-billing.md), the numbers in force are the ones in the entitlement Nubisco's licenses service sends: the Paddle product's for Pro, licenses' own Free row for Free, or a sales override.

## Entitlement resolution order

```
1. Determine active plan
   a. OSS: plan = oss_self_hosted (no billing, no license key)
   b. Managed SaaS: the account's AccountPlan, the cached entitlement from
      Nubisco's licenses service → planId and limits (packages/ee/src/plans,
      docs/plans-and-billing.md). Only when billing is configured.
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
