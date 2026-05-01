// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Advanced Audit Logs: placeholder for EE audit log features.
// CE audit logging lives in apps/api/src/services/audit.service.ts.

export function isAdvancedAuditEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function exportAuditLogs(_projectId: string): Promise<never> {
  throw Object.assign(new Error('Advanced audit export requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
