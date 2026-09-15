import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'

interface InstanceFeatures {
  organizations: boolean
  [key: string]: boolean
}

/** Federated sign-in, when this instance has a provider configured. */
interface InstanceSsoConfig {
  enabled: boolean
  mode: 'oidc' | 'handover' | null
  /** What to call the provider on the button, e.g. "Okta". */
  label: string | null
}

interface InstanceAuthConfig {
  mode: 'local_otp' | 'local_password' | 'hybrid'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  platformAppId: string | null
  sso: InstanceSsoConfig
}

interface InstanceConfig {
  features: InstanceFeatures
  // `sso` is optional on the wire: an API that predates server-side federated
  // sign-in omits the block, and the store fills in the disabled default.
  auth: Omit<InstanceAuthConfig, 'sso'> & { sso?: InstanceSsoConfig }
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
    sso: { enabled: false, mode: null, label: null },
  })
  const ready = ref(false)

  async function fetch() {
    try {
      const config = await apiFetch<InstanceConfig>('/config')
      features.value = config.features
      // An older API that predates server-side SSO omits the block entirely,
      // so default it rather than letting every read of it throw.
      auth.value = { ...config.auth, sso: config.auth.sso ?? { enabled: false, mode: null, label: null } }
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
