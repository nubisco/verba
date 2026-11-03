---
layout: nubisco
title: 'Plans and Billing'
intro: "Nubisco's hosted Verba is offered free and paid. Plans and billing are Enterprise Edition code that only switches on when an instance is connected to Nubisco's licenses service. A self-hosted instance has none of it: no plans, no limits from billing, no billing page."
---

## How it fits together

Paddle is the merchant of record, and Nubisco's licenses service owns everything Paddle knows: subscriptions, prices, the customer portal, and sales deals. Verba never calls Paddle and never holds a Paddle key.

- **The account is the billed unit.** licenses keeps one billing account per Verba `Account` (product `verba`, workspace id = the account id).
- **Verba keeps a copy of each account's entitlement** in the `AccountPlan` table: plan, state, limits and the subscription summary. Plan resolution (`resolveEntitlements` in `packages/ee/src/entitlements`) reads only that copy.
- **The limits come from licenses, not from Verba.** For Pro they are the Paddle product's `custom_data`, for Free they are licenses' own Free row, and a sales override replaces either. Verba's plan table (`packages/ee/src/entitlements/plans.ts`) describes the same two plans, Free and Pro, which differ only by limits: every feature is on both. A sales deal shows as Enterprise, with the features of Pro and the limits of its override.

The code is `packages/ee/src/plans`. The API loads it from `apps/api/src/services/billing.service.ts`, which is the only Community Edition file that knows it exists.

## Keeping the copy current

1. **Webhook.** licenses signs every change as `entitlement.updated` and posts it to `POST /api/billing/entitlement`. Verba checks `X-Nubisco-Signature: sha256=<hex HMAC-SHA256 of the raw body>` in constant time and applies the entitlement if its `version` is newer than the one held. A replayed or late delivery has an equal or lower version and changes nothing, so there is no timestamp window. An account Verba does not know is answered with 2xx so licenses stops retrying.
2. **Fetch.** When the copy is missing or more than a day old, Verba asks licenses (`GET /v1/entitlements/verba/:accountId`) with its service token. The billing page always asks, so someone back from checkout sees the new plan even if the webhook is late.
3. **Never downgrade on a network error.** If licenses cannot be reached, the copy held stays. Only an account with no copy at all and no answer from licenses is treated as Free.

## Limits

On a hosted plan, creating past a limit is refused with `402` and a `plan_limit` body: `{ error, code: "plan_limit", resource, limit, current, adding }`, where `resource` is `projects`, `members` or `keys`. The web app opens one upgrade prompt for any of these, in the server's words, with **See plans** for the account's owners and admins.

- **Projects**: creating one. On a hosted plan this account limit replaces the older per-person project cap that comes from the Platform token's `app_plan`.
- **Members**: adding a person to the account, directly or by adding them to one of its projects.
- **Keys**: creating one, and imports (CSV, XLSX, JSON and XLIFF). An import that would create more keys than fit is refused before it writes anything. Keys it would only update do not count.

Only creation is checked. Nothing is deleted, and nothing already over a limit (after a downgrade, say) becomes read-only. On a Community or self-hosted instance nothing is refused and nothing is counted: the check returns before it reads the database (`apps/api/src/services/plan-limits.service.ts`).

## Upgrading

Paddle runs a checkout only on `nubisco.io`. It refuses one on any product's own domain ("Transaction checkout creation is blocked for this vendor"), so Verba never loads Paddle.js.

1. An account owner or admin opens **Settings, Billing** and chooses monthly or yearly.
2. Verba's API asks licenses for a transaction (`POST /v1/billing/checkout` with `app: verba`, `plan: pro` and the account id). licenses creates it with the account in its `custom_data` and its checkout page set to Verba's page on nubisco.io, and answers with that page's address carrying `?_ptxn=`.
3. The browser goes there, with a `return` address back to this page. When Paddle reports the checkout complete, the page sends the buyer back, and the billing page asks licenses for the plan.

**Manage billing** opens Paddle's customer portal through licenses (`POST /v1/billing/portal`), in a new tab. Payment method, invoices and cancelling all live there, and their effects come back as webhooks.

A downgrade, a failed payment or a cancel never deletes anything.

## Configuration

All four are read by the API. Leave them unset on a self-hosted instance.

| Variable                           | What it is                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_EE`                        | Must be `true`. Plans are Enterprise Edition code.                                                                                              |
| `VERBA_LICENSES_URL`               | The licenses service, e.g. `https://licenses.nubisco.io`. Plans switch on only when this and the token are set.                                 |
| `VERBA_LICENSES_SERVICE_TOKEN`     | Secret. The same value as `SERVICE_TOKEN_VERBA` in licenses.                                                                                    |
| `VERBA_ENTITLEMENT_WEBHOOK_SECRET` | Secret. The same value as `ENTITLEMENT_WEBHOOK_SECRET_VERBA` in licenses. Unset, the webhook answers 404 and the copy is only kept by fetching. |
| `VERBA_SALES_URL`                  | Optional. Where **Contact sales** points.                                                                                                       |

Secrets go in the deployment's environment, never in a tracked file.

## Switching it on

1. In licenses, give any account that must not fall to the Free limits an override first (`POST /v1/admin/billing/overrides`), Nubisco's own included. Otherwise it is held to Free the moment plans switch on.
2. In licenses, set `CHECKOUT_URL_VERBA` to `https://nubisco.io/products/verba` and `ENTITLEMENT_WEBHOOK_URL_VERBA` to `https://<verba host>/api/billing/entitlement`, and make sure the nubisco.io page opens `?_ptxn=` and accepts a return address on the Verba host.
3. In Verba, set the variables above and restart. The API logs `Hosted billing: plans come from the licenses service`, and `/config` reports `features.billing: true`.
