import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch } from '../api'

export interface EntitlementSetJson {
  features: string[]
  maxProjects: number | null
  maxSeatsPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
  maxMonthlyApiCalls: number | null
}

export interface PlanSummary {
  id: string
  name: string
  managed: boolean
  requiresLicenseKey: boolean
}

export interface LicenseStateSummary {
  status: 'none' | 'valid' | 'grace' | 'expired' | 'invalid'
  licensee: string | null
  planId: string | null
  seats: number | null
  expiresAt: string | null
  graceEndsAt: string | null
  lastVerifiedAt: string | null
}

export interface SubscriptionSummary {
  planId: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface EntitlementsResponse {
  plan: PlanSummary
  entitlements: EntitlementSetJson
  licenseState: LicenseStateSummary
  subscription: SubscriptionSummary | null
  hasOverride: boolean
}

export const useEntitlementsStore = defineStore('entitlements', () => {
  const data = ref<EntitlementsResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isManaged = computed(() => data.value?.plan.managed ?? false)
  const planId = computed(() => data.value?.plan.id ?? 'oss_self_hosted')
  const licenseStatus = computed(() => data.value?.licenseState.status ?? 'none')

  async function fetch(orgId?: string) {
    loading.value = true
    error.value = null
    try {
      const qs = orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
      data.value = await apiFetch<EntitlementsResponse>(`/admin/entitlements${qs}`)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entitlements'
    } finally {
      loading.value = false
    }
  }

  function hasFeature(feature: string): boolean {
    return data.value?.entitlements.features.includes(feature) ?? false
  }

  return { data, loading, error, isManaged, planId, licenseStatus, fetch, hasFeature }
})
