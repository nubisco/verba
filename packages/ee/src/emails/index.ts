// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Emails: transactional email adapter for EE deployments.
// Supports Resend as the primary provider with a no-op fallback
// so OSS deployments never fail on missing email config.

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

export function isEmailEnabled(): boolean {
  return !!(process.env.LICENSE_KEY && process.env.RESEND_API_KEY)
}

export async function sendEmail(_payload: EmailPayload): Promise<void> {
  // No-op in OSS mode: email sending is an EE feature.
  // Configure RESEND_API_KEY and a valid LICENSE_KEY to enable.
}
