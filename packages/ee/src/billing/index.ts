// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Billing: Stripe subscription management.
// Integrates with Stripe to handle checkout sessions, billing portal,
// webhook ingestion, and subscription lifecycle syncing.

export function isBillingEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function createCheckoutSession(_orgId: string, _planId: string): Promise<never> {
  throw Object.assign(new Error('Billing requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}

export async function createBillingPortalSession(_orgId: string): Promise<never> {
  throw Object.assign(new Error('Billing requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}

export async function handleStripeWebhook(_payload: unknown, _signature: string): Promise<never> {
  throw Object.assign(new Error('Billing requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
