import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'

interface InstanceFeatures {
  organizations: boolean
  [key: string]: boolean
}

interface InstanceAuthConfig {
  mode: 'local_otp' | 'local_password' | 'hybrid'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  platformAppId: string | null
}

interface InstanceConfig {
  features: InstanceFeatures
  auth: InstanceAuthConfig
}

export const useInstanceConfigStore = defineStore('instanceConfig', () => {
  const features = ref<InstanceFeatures>({ organizations: false })
  const auth = ref<InstanceAuthConfig>({
    mode: 'local_otp',
    localOtpEnabled: true,
    localPasswordEnabled: false,
    platformEnabled: false,
    platformIssuer: null,
    platformAppId: null,
  })
  const ready = ref(false)

  async function fetch() {
    try {
      const config = await apiFetch<InstanceConfig>('/config')
      features.value = config.features
      auth.value = config.auth
    } catch {
      // Fail silently: all feature flags default to false (off)
    } finally {
      ready.value = true
    }
  }

  function hasFeature(flag: string): boolean {
    return features.value[flag] ?? false
  }

  return { features, auth, ready, fetch, hasFeature }
})
