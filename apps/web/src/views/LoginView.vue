<template>
  <div class="login-page">
    <div class="login-card">
      <div class="auth-logo-wrap">
        <img :src="logoSrc" alt="Verba" class="auth-logo" />
        <span v-if="platformOnly" class="auth-logo-name">Verba</span>
      </div>

      <!-- Platform-only login (like Analytics) -->
      <template v-if="platformOnly">
        <p class="subtitle">Sign in with Nubisco Platform to continue.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <NbButton
          variant="primary"
          size="lg"
          class="platform-btn"
          :disabled="loading || auth.loading"
          @click="startPlatformLogin"
        >
          Continue with Platform
        </NbButton>
      </template>

      <!-- Local auth (OTP / password) with optional Platform button -->
      <template v-else>
        <!-- Mode tabs -->
        <div v-if="mode !== 'otp-verify'" class="tabs">
          <NbButton
            v-if="instanceConfig.auth.localPasswordEnabled"
            :class="{ active: mode === 'login' }"
            @click="
              () => {
                mode = 'login'
                error = ''
              }
            "
          >
            {{ t('auth.login.tab.password') }}
          </NbButton>
          <NbButton
            v-if="instanceConfig.auth.localOtpEnabled"
            :class="{ active: mode === 'otp-request' }"
            @click="
              () => {
                mode = 'otp-request'
                error = ''
              }
            "
          >
            {{ t('auth.login.tab.magic') }}
          </NbButton>
          <NbButton
            v-if="instanceConfig.auth.localPasswordEnabled"
            :class="{ active: mode === 'register' }"
            @click="
              () => {
                mode = 'register'
                error = ''
              }
            "
          >
            {{ t('auth.login.tab.register') }}
          </NbButton>
        </div>

        <p class="subtitle">
          <span v-if="mode === 'login'">{{ t('auth.login.subtitle') }}</span>
          <span v-else-if="mode === 'register'">Create a new account</span>
          <span v-else-if="mode === 'otp-request'">{{ t('auth.login.magic.description') }}</span>
          <span v-else>Enter the code we sent to {{ email }}</span>
        </p>

        <NbButton
          v-if="instanceConfig.auth.platformEnabled"
          variant="secondary"
          outlined
          size="lg"
          class="platform-btn"
          :disabled="loading || auth.loading"
          @click="startPlatformLogin"
        >
          Continue with Nubisco Platform
        </NbButton>

        <form @submit.prevent="submit">
          <div v-if="mode !== 'otp-verify'" class="field">
            <label for="email">{{ t('auth.login.email') }}</label>
            <NbTextInput id="email" v-model="email" type="email" required autocomplete="email" />
          </div>
          <div v-if="mode === 'login' || mode === 'register'" class="field">
            <label for="password">{{ t('auth.login.password') }}</label>
            <NbTextInput
              id="password"
              v-model="password"
              type="password"
              required
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              placeholder="Min. 8 characters"
            />
          </div>
          <div v-if="mode === 'otp-verify'" class="field">
            <label for="otp">One-time code</label>
            <NbTextInput
              id="otp"
              v-model="otpCode"
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
            variant="ghost"
            size="sm"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const instanceConfig = useInstanceConfigStore()
const { t } = useI18n()
const logoSrc = `${import.meta.env.BASE_URL}logo.svg`

const mode = ref<'login' | 'register' | 'otp-request' | 'otp-verify'>('login')
const email = ref('')
const password = ref('')
const otpCode = ref('')
const error = ref('')
const loading = ref(false)
const PLATFORM_STATE_KEY = 'verba.platform.sso.state'
const PLATFORM_REDIRECT_KEY = 'verba.platform.sso.redirect'

// Platform-only: show only the Platform button when Platform is enabled
// and no local auth methods are explicitly enabled
const platformOnly = computed(() => {
  const a = instanceConfig.auth
  return a.platformEnabled && !a.localPasswordEnabled
})

onMounted(() => {
  if (auth.user) router.replace('/projects')
  syncModeWithConfig()
  handlePlatformCallback()
})

watch(
  () => instanceConfig.auth,
  () => {
    syncModeWithConfig()
  },
  { deep: true },
)

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
  const token = route.query.token
  const state = route.query.state
  const platformError = route.query.error

  if (typeof platformError === 'string') {
    error.value = `Platform login failed: ${platformError}`
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

function startPlatformLogin() {
  const issuer = instanceConfig.auth.platformIssuer
  if (!issuer) return

  const state = crypto.randomUUID()
  const callbackUrl = new URL(`${window.location.origin}${import.meta.env.BASE_URL}login`)
  const redirectTarget = (route.query.redirect as string) || '/projects'

  sessionStorage.setItem(PLATFORM_STATE_KEY, state)
  sessionStorage.setItem(PLATFORM_REDIRECT_KEY, redirectTarget)

  const ssoUrl = new URL('/api/auth/sso', issuer)
  ssoUrl.searchParams.set('app_id', instanceConfig.auth.platformAppId || 'verba')
  ssoUrl.searchParams.set('redirect_uri', callbackUrl.toString())
  ssoUrl.searchParams.set('state', state)
  // Force the platform to prompt for credentials so we never inherit
  // a stale platform session belonging to a different identity.
  ssoUrl.searchParams.set('prompt', 'login')

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
  background: #f7f7f9;
}

.login-card {
  background: #fff;
  padding: 2.5rem 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
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
    color: #1a1a2e;
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: #666;
    margin: 0.75rem 0 1.25rem;
    font-size: 0.9rem;
    text-align: center;
  }
}

.tabs {
  display: flex;
  gap: 0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0;

  button {
    flex: 1;
    padding: 0.45rem 0.5rem;
    background: #f7f7f9;
    border: none;
    font-size: 0.82rem;
    cursor: pointer;
    color: #666;
    border-right: 1px solid #d0d0d0;
    transition: background 0.12s;
    &:last-child {
      border-right: none;
    }
    &:hover {
      background: #eee;
    }
    &.active {
      background: #1a1a2e;
      color: #fff;
      font-weight: 600;
    }
  }
}

.field {
  margin-bottom: 1rem;
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    margin-bottom: 0.35rem;
    color: #333;
  }
  .hint {
    font-size: 0.78rem;
    color: #888;
    margin: 0.25rem 0 0;
  }
}

.error {
  color: #c0392b;
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
  color: #555;
  :deep(.nb-button) {
    text-decoration: underline;
  }
}
</style>
