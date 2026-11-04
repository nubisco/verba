import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'

// Instance feature flags from /config: `billing` (hosted plans on) and
// `checkout` (accounts may buy a plan, VERBA_CHECKOUT_OPEN).
interface InstanceFeatures {
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
  /** `platform`: the identity provider only (VERBA_AUTH_MODE), no wizard and no local sign-in. */
  mode: 'local_otp' | 'local_password' | 'hybrid' | 'platform'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  /** Accord's auth host, where the browser's platform session lives. Not the
   *  issuer, which is only an identifier in tokens. */
  platformAuthOrigin: string | null
  platformAppId: string | null
  sso: InstanceSsoConfig
}

/** The legal documents a new account accepts (VERBA_TERMS_VERSION and its links). */
export interface TermsConfig {
  version: string
  termsUrl: string | null
  privacyUrl: string | null
}

/** Whether a new address may create an account here, and the terms it accepts. */
interface InstanceSignupConfig {
  open: boolean
  terms: TermsConfig | null
}

interface InstanceConfig {
  features: InstanceFeatures
  // Optional on the wire: an API that predates the sign-up switch omits it.
  signup?: InstanceSignupConfig
  /** Where "Contact sales" points, on an instance that sells hosted plans. */
  salesUrl?: string | null
  // `sso` is optional on the wire: an API that predates server-side federated
  // sign-in omits the block, and the store fills in the disabled default.
  // `platformAuthOrigin` is optional too: an API that predates it omits it,
  // and the store falls back to the issuer.
  auth: Omit<InstanceAuthConfig, 'sso' | 'platformAuthOrigin'> & {
    sso?: InstanceSsoConfig
    platformAuthOrigin?: string | null
  }
}

export const useInstanceConfigStore = defineStore('instanceConfig', () => {
  const features = ref<InstanceFeatures>({})
  const auth = ref<InstanceAuthConfig>({
    mode: 'local_otp',
    localOtpEnabled: true,
    localPasswordEnabled: false,
    platformEnabled: false,
    platformIssuer: null,
    platformAuthOrigin: null,
    platformAppId: null,
    sso: { enabled: false, mode: null, label: null },
  })
  const signup = ref<InstanceSignupConfig>({ open: true, terms: null })
  const salesUrl = ref<string | null>(null)
  const ready = ref(false)

  async function fetch() {
    try {
      const config = await apiFetch<InstanceConfig>('/config')
      features.value = config.features
      signup.value = config.signup ?? { open: true, terms: null }
      salesUrl.value = config.salesUrl ?? null
      // An older API that predates server-side SSO omits the block entirely,
      // so default it rather than letting every read of it throw.
      auth.value = {
        ...config.auth,
        platformAuthOrigin: config.auth.platformAuthOrigin || config.auth.platformIssuer,
        sso: config.auth.sso ?? { enabled: false, mode: null, label: null },
      }
    } catch {
      // Fail silently: all feature flags default to false (off)
    } finally {
      ready.value = true
    }
  }

  function hasFeature(flag: string): boolean {
    return features.value[flag] ?? false
  }

  return { features, auth, signup, salesUrl, ready, fetch, hasFeature }
})
