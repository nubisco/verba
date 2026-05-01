// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Limits: plan-based resource limits (projects, members, keys, etc.).
// Resolves the active plan's entitlements and enforces hard limits
// on resource creation before mutations reach the service layer.

export interface PlanLimits {
  maxProjects: number | null
  maxMembersPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
}

export function isLimitsEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function getPlanLimits(_orgId: string): Promise<PlanLimits> {
  // OSS fallback: no limits
  return {
    maxProjects: null,
    maxMembersPerProject: null,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
  }
}

export async function assertWithinLimit(_orgId: string, _resource: string, _current: number): Promise<void> {
  // OSS fallback: always allow
}
