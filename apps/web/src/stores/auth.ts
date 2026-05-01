import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'
import router from '../router'
import { identifyUser, resetUser, trackEvent } from '../composables/useAnalytics'

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
    router.push('/login')
  }

  return { user, loading, fetchMe, login, register, logout }
})
