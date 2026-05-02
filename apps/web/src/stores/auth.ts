import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'
import router from '../router'
import { identifyUser, resetUser, trackEvent } from '../composables/useAnalytics'
import { useInstanceConfigStore } from './instanceConfig'

interface User {
  id: string
  email: string
  name?: string | null
  isGlobalAdmin?: boolean
  notificationOpenMode?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)

  async function fetchMe() {
    loading.value = true
    try {
      const me = await apiFetch<User>('/auth/me')
      user.value = me
      identifyUser(me.id, { email: me.email, name: me.name ?? undefined })
    } catch {
      user.value = null
      resetUser()
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const me = await apiFetch<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      user.value = me
      identifyUser(me.id, { email: me.email, name: me.name ?? undefined })
      trackEvent('Login', { method: 'password' })
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, password: string) {
    loading.value = true
    try {
      const me = await apiFetch<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      user.value = me
      identifyUser(me.id, { email: me.email, name: me.name ?? undefined })
      trackEvent('Register', { method: 'password' })
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
    resetUser()
    user.value = null

    // If this instance signs in via the Nubisco platform, redirect through
    // the platform's RP-initiated logout so the platform session is also
    // destroyed. Otherwise the next sign-in would silently re-authenticate
    // as whoever's still logged into platform.nubisco.io.
    const instanceConfig = useInstanceConfigStore()
    const issuer = instanceConfig.auth.platformIssuer
    const appId = instanceConfig.auth.platformAppId
    if (instanceConfig.auth.platformEnabled && issuer && appId) {
      const postLogout = `${window.location.origin}${import.meta.env.BASE_URL}login`
      const url = new URL('/api/auth/sso/end-session', issuer)
      url.searchParams.set('app_id', appId)
      url.searchParams.set('post_logout_redirect_uri', postLogout)
      window.location.href = url.toString()
      return
    }
    router.push('/login')
  }

  return { user, loading, fetchMe, login, register, logout }
})
