import router from './router'

// Exported because federated sign-in is a full-page navigation to the API
// rather than a fetch: the browser has to leave the SPA for the provider and
// come back, so the login view needs the API's address, not just a client.
export const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')

const BASE = API_BASE

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET'
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (!isGet && options.body != null) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (res.status === 401) {
    router.push('/login')
    throw new Error('Unauthorized')
  }

  if (res.status === 204) {
    return undefined as T
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? 'Request failed')
  }
  return data as T
}
