<template>
  <div class="login-page">
    <NbPanel class="login-card">
      <div class="auth-logo-wrap">
        <img :src="logoSrc" alt="Verba" class="auth-logo" />
        <span v-if="platformOnly" class="auth-logo-name">Verba</span>
      </div>

      <!-- Platform-only login (like Analytics) -->
      <template v-if="platformOnly">
        <p class="subtitle">Sign in with {{ ssoLabel }} to continue.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <NbButton
          variant="primary"
          size="lg"
          class="platform-btn"
          :disabled="loading || auth.loading"
          @click="startSignIn({ loginHint })"
        >
          Continue with {{ ssoLabel }}
        </NbButton>
        <p class="toggle">
          <NbButton
            type="button"
            variant="link"
            :disabled="loading || auth.loading"
            @click="startSignIn({ prompt: 'select_account' })"
          >
            {{ t('auth.login.platform.useAnotherAccount') }}
          </NbButton>
        </p>
      </template>

      <!-- Local auth (OTP / password) with optional Platform button -->
      <template v-else>
        <!-- Mode tabs -->
        <NbTabs
          v-if="mode !== 'otp-verify'"
          :model-value="mode"
          :items="modeTabs"
          variant="contained"
          full-width
          aria-label="Sign-in method"
          class="tabs"
          @update:model-value="switchMode($event as Mode)"
        />

        <p class="subtitle">
          <span v-if="mode === 'login'">{{ t('auth.login.subtitle') }}</span>
          <span v-else-if="mode === 'register'">Create a new account</span>
          <span v-else-if="mode === 'otp-request'">{{ t('auth.login.magic.description') }}</span>
          <span v-else>Enter the code we sent to {{ email }}</span>
        </p>

        <NbButton
          v-if="providerAvailable"
          variant="secondary"
          outlined
          size="lg"
          class="platform-btn"
          :disabled="loading || auth.loading"
          @click="startSignIn({ loginHint })"
        >
          Continue with {{ ssoLabel }}
        </NbButton>

        <form @submit.prevent="submit">
          <div v-if="mode !== 'otp-verify'" class="field">
            <NbTextInput
              id="email"
              v-model="email"
              :label="t('auth.login.email')"
              type="email"
              required
              autocomplete="email"
            />
          </div>
          <div v-if="mode === 'login' || mode === 'register'" class="field">
            <NbTextInput
              id="password"
              v-model="password"
              :label="t('auth.login.password')"
              type="password"
              required
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              placeholder="Min. 8 characters"
            />
          </div>
          <div v-if="mode === 'otp-verify'" class="field">
            <NbTextInput
              id="otp"
              v-model="otpCode"
              label="One-time code"
              type="text"
              inputmode="numeric"
              :maxlength="6"
              placeholder="123456"
              autocomplete="one-time-code"
              required
            />
            <p class="hint">Check your email (or server logs in development).</p>
          </div>

          <p v-if="error" class="error">{{ error }}</p>

          <NbButton variant="primary" type="submit" size="lg" :disabled="loading || auth.loading" class="submit-btn">
            <span v-if="loading || auth.loading">{{ t('common.loading') }}</span>
            <span v-else-if="mode === 'login'">{{ t('auth.login.submit') }}</span>
            <span v-else-if="mode === 'register'">{{ t('auth.login.register.submit') }}</span>
            <span v-else-if="mode === 'otp-request'">{{ t('auth.login.magic.send') }}</span>
            <span v-else>{{ t('auth.login.magic.verify') }}</span>
          </NbButton>
        </form>

        <p v-if="mode === 'otp-verify'" class="toggle">
          <NbButton
            type="button"
            variant="link"
            @click="
              () => {
                mode = 'otp-request'
                otpCode = ''
                error = ''
              }
            "
          >
            {{ t('common.back') }} / resend
          </NbButton>
        </p>
      </template>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { apiFetch, API_BASE } from '../api'
import { takeSsoToken } from '../utils/ssoToken'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const instanceConfig = useInstanceConfigStore()
const { t } = useI18n()
const logoSrc = `${import.meta.env.BASE_URL}logo.svg`

type Mode = 'login' | 'register' | 'otp-request' | 'otp-verify'
const mode = ref<Mode>('login')

// The sign-in methods this instance offers, as tabs. Picking one clears any
// error the previous method left behind.
const modeTabs = computed(() => [
  ...(instanceConfig.auth.localPasswordEnabled ? [{ id: 'login', label: t('auth.login.tab.password') }] : []),
  ...(instanceConfig.auth.localOtpEnabled ? [{ id: 'otp-request', label: t('auth.login.tab.magic') }] : []),
  ...(instanceConfig.auth.localPasswordEnabled ? [{ id: 'register', label: t('auth.login.tab.register') }] : []),
])
function switchMode(next: Mode) {
  mode.value = next
  error.value = ''
}
const email = ref('')
const password = ref('')
const otpCode = ref('')
const error = ref('')
const loading = ref(false)
const PLATFORM_STATE_KEY = 'verba.platform.sso.state'
const PLATFORM_REDIRECT_KEY = 'verba.platform.sso.redirect'

/**
 * Is there a federated provider to offer at all?
 *
 * Two mechanisms answer this, and the newer one wins. `auth.sso` is the
 * server-side flow: the API owns both legs, so the provider can be any OIDC
 * one (Keycloak, Auth0, Okta, Entra, Google) as well as Nubisco Platform.
 * `auth.platformEnabled` is the original browser-driven handover, kept
 * working for instances that have not configured the server-side flow.
 */
const serverSso = computed(() => instanceConfig.auth.sso?.enabled === true)
const providerAvailable = computed(() => serverSso.value || instanceConfig.auth.platformEnabled)

/**
 * What to call the provider on the button.
 *
 * This said "Nubisco Platform" in the markup, which is right on exactly one
 * instance. A self-hoster pointing Verba at their own Okta was being told to
 * sign in with a product their users have no account on, so the name comes
 * from the server and an operator sets it with OIDC_LABEL.
 */
const ssoLabel = computed(() => instanceConfig.auth.sso?.label ?? 'Nubisco Platform')

// Platform-only: show only the provider button when a provider is enabled
// and no local auth methods are explicitly enabled
const platformOnly = computed(() => providerAvailable.value && !instanceConfig.auth.localPasswordEnabled)

// The platform launchpad opens our launch URL with ?login_hint=<email>
// appended. Forwarding it into the SSO request makes the user land already
// signed in as the account they clicked (multi-account sessions).
const loginHint = computed(() => {
  const hint = route.query.login_hint
  return typeof hint === 'string' && hint ? hint : undefined
})

const redirectTarget = computed(() => (route.query.redirect as string) || '/projects')

// main.ts strips the SSO token from the URL before anything else can read it,
// so the token arrives here in memory instead of via route.query. Taken once,
// at setup, so revisiting /login later cannot replay it.
const platformToken = takeSsoToken()

const hasPlatformCallback = computed(() => platformToken !== null || typeof route.query.error === 'string')

let autoStarted = false

onMounted(() => {
  if (auth.user && !hasPlatformCallback.value && !loginHint.value) {
    router.replace('/projects')
    return
  }
  if (loginHint.value) email.value = loginHint.value
  syncModeWithConfig()
  handlePlatformCallback()
  maybeAutoStartFromHint()
})

watch(
  () => instanceConfig.auth,
  () => {
    syncModeWithConfig()
    maybeAutoStartFromHint()
  },
  { deep: true },
)

// When launched from the platform with a login_hint, go straight through SSO
// as the hinted account (a no-interaction round-trip when that identity is
// already in the browser session). Also covers being signed in locally as a
// different user: the hinted authorize re-pins us to the account the user
// actually clicked, instead of keeping the old session underneath them.
function maybeAutoStartFromHint() {
  if (autoStarted || !loginHint.value || hasPlatformCallback.value) return
  if (!providerAvailable.value) {
    if (instanceConfig.ready && auth.user) router.replace(redirectTarget.value)
    return
  }
  const signedInAsHinted = auth.user?.email?.toLowerCase() === loginHint.value.toLowerCase()
  if (signedInAsHinted) {
    router.replace(redirectTarget.value)
    return
  }
  if (!platformOnly.value && !auth.user) return // hybrid: prefill only, let the user choose
  autoStarted = true
  startSignIn({ loginHint: loginHint.value })
}

function syncModeWithConfig() {
  if (mode.value === 'otp-verify') return
  if (instanceConfig.auth.localPasswordEnabled) {
    if (mode.value === 'otp-request' && !instanceConfig.auth.localOtpEnabled) {
      mode.value = 'login'
    } else if (mode.value !== 'login' && mode.value !== 'register' && mode.value !== 'otp-request') {
      mode.value = 'login'
    }
    return
  }
  if (instanceConfig.auth.localOtpEnabled) {
    mode.value = 'otp-request'
  }
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value)
      redirect()
    } else if (mode.value === 'register') {
      await auth.register(email.value, password.value)
      redirect()
    } else if (mode.value === 'otp-request') {
      await apiFetch('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ email: email.value }),
      })
      mode.value = 'otp-verify'
    } else if (mode.value === 'otp-verify') {
      await apiFetch<{ id: string; email: string }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ email: email.value, code: otpCode.value }),
      })
      await auth.fetchMe()
      redirect()
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}

async function handlePlatformCallback() {
  const token = platformToken
  const state = route.query.state
  const platformError = route.query.error

  if (typeof platformError === 'string') {
    // The server never says which half of a check failed, because telling an
    // attacker that is telling them how to pass it. These are the codes it
    // does emit, turned into something a person can act on.
    const messages: Record<string, string> = {
      not_a_member: 'That account cannot sign in to this instance',
      sso_state: 'The sign-in attempt expired; try again',
      sso_token: 'Single sign-on failed; try again',
      sso_discovery: 'The identity provider could not be reached; try again shortly',
    }
    error.value = messages[platformError] ?? `Sign-in failed: ${platformError}`
    clearPlatformCallbackQuery()
    return
  }

  if (typeof token !== 'string') return

  const expectedState = sessionStorage.getItem(PLATFORM_STATE_KEY)
  if (!expectedState || expectedState !== state) {
    error.value = 'Platform login failed: invalid state'
    clearPlatformCallbackQuery()
    return
  }

  loading.value = true
  error.value = ''

  try {
    await apiFetch<{ id: string; email: string }>('/auth/platform/callback', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    await auth.fetchMe()
    const nextRedirect =
      sessionStorage.getItem(PLATFORM_REDIRECT_KEY) || (route.query.redirect as string) || '/projects'
    sessionStorage.removeItem(PLATFORM_STATE_KEY)
    sessionStorage.removeItem(PLATFORM_REDIRECT_KEY)
    await router.replace(nextRedirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Platform login failed'
    clearPlatformCallbackQuery()
  } finally {
    loading.value = false
  }
}

/**
 * Begin a sign-in, by whichever mechanism this instance has.
 *
 * The server-side flow is a plain navigation: the API builds the authorize
 * URL, keeps the state, PKCE verifier and nonce in httpOnly cookies, and has
 * already set the session cookie by the time the browser lands back here. No
 * state in sessionStorage, and no credential ever in the address bar.
 */
function startSignIn(options: { loginHint?: string; prompt?: 'login' | 'select_account' } = {}) {
  if (!serverSso.value) return startPlatformLogin(options)

  const url = new URL(`${API_BASE}/auth/sso/start`, window.location.origin)
  url.searchParams.set('redirect', redirectTarget.value)
  if (options.loginHint) url.searchParams.set('login_hint', options.loginHint)
  if (options.prompt) url.searchParams.set('prompt', options.prompt)
  window.location.href = url.toString()
}

function startPlatformLogin(options: { loginHint?: string; prompt?: 'login' | 'select_account' } = {}) {
  // The auth host, not the issuer: the browser's platform session lives there.
  const authOrigin = instanceConfig.auth.platformAuthOrigin
  const appId = instanceConfig.auth.platformAppId
  // No fallback. This used to default to 'verba' when PLATFORM_APP_ID was
  // unset, which is the slug no platform app actually has: ours is registered
  // as 'nubisco-verba', so every sign-in bounced off `unknown_app` and the
  // user saw a redirect that came straight back. A missing app id is a
  // configuration fault, and saying so beats guessing wrong in silence.
  if (!authOrigin || !appId) {
    error.value = 'Platform sign-in is not fully configured on this instance'
    return
  }

  const state = crypto.randomUUID()
  const callbackUrl = new URL(`${window.location.origin}${import.meta.env.BASE_URL}login`)

  sessionStorage.setItem(PLATFORM_STATE_KEY, state)
  sessionStorage.setItem(PLATFORM_REDIRECT_KEY, redirectTarget.value)

  const ssoUrl = new URL('/api/auth/sso', authOrigin)
  ssoUrl.searchParams.set('app_id', appId)
  ssoUrl.searchParams.set('redirect_uri', callbackUrl.toString())
  ssoUrl.searchParams.set('state', state)
  // No prompt on the default login button: the platform resolves our app's
  // pinned identity (or shows its account chooser when we have no pin).
  // login_hint resumes a specific account; prompt=login forces a fresh OTP
  // (add another account); prompt=select_account shows the platform chooser.
  if (options.loginHint) ssoUrl.searchParams.set('login_hint', options.loginHint)
  if (options.prompt) ssoUrl.searchParams.set('prompt', options.prompt)
  window.location.href = ssoUrl.toString()
}

function redirect() {
  const dest = (route.query.redirect as string) || '/projects'
  router.replace(dest)
}

function clearPlatformCallbackQuery() {
  const redirectTarget = route.query.redirect
  router.replace({
    path: '/login',
    query: typeof redirectTarget === 'string' ? { redirect: redirectTarget } : {},
  })
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nb-c-bg);
}

.login-card {
  padding: 2.5rem 2rem;
  box-shadow: 0 2px 16px color-mix(in srgb, var(--nb-c-black) 10%, transparent);
  width: 100%;
  max-width: 380px;

  .auth-logo-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .auth-logo {
    height: 48px;
    width: auto;
  }

  .auth-logo-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--nb-c-text);
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: var(--nb-c-text-subtle);
    margin: 0.75rem 0 1.25rem;
    font-size: 0.9rem;
    text-align: center;
  }
}

.tabs {
  margin-bottom: 0;
}

.field {
  margin-bottom: 1rem;
  .hint {
    font-size: 0.78rem;
    color: var(--nb-c-text-subtle);
    margin: 0.25rem 0 0;
  }
}

.error {
  color: var(--nb-c-status-error);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
  text-align: center;
}

.platform-btn,
.submit-btn {
  width: 100%;
}

.toggle {
  margin-top: 1.25rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--nb-c-text-muted);
}
</style>
