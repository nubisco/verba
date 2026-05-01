// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Jobs: background job orchestration via Trigger.dev.
// Handles async workloads such as bulk exports, import processing,
// and scheduled license checks. No-op in OSS mode.

export function isJobsEnabled(): boolean {
  return !!(process.env.LICENSE_KEY && process.env.TRIGGER_SECRET_KEY)
}

export async function enqueueJob(_name: string, _payload: unknown): Promise<void> {
  // No-op in OSS mode: background jobs are an EE feature.
  // Configure TRIGGER_SECRET_KEY and a valid LICENSE_KEY to enable.
}
